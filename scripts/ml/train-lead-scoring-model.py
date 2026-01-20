#!/usr/bin/env python3
"""
Lead Scoring Model Training Pipeline
Uses XGBoost to predict lead conversion probability based on historical data

Open-source ML approach using:
- XGBoost (gradient boosting)
- scikit-learn (preprocessing, evaluation)
- SHAP (explainability)

Requirements:
pip install xgboost scikit-learn pandas numpy shap psycopg2-binary python-dotenv joblib

Usage:
python train-lead-scoring-model.py --output ./models --evaluate
"""

import os
import sys
import json
import argparse
from datetime import datetime
from pathlib import Path

import pandas as pd
import numpy as np
from dotenv import load_dotenv
import psycopg2
from psycopg2.extras import RealDictCursor

# ML imports
from sklearn.model_selection import train_test_split, cross_val_score
from sklearn.preprocessing import LabelEncoder, StandardScaler
from sklearn.metrics import (
    accuracy_score, precision_score, recall_score, f1_score,
    roc_auc_score, classification_report, confusion_matrix
)
import xgboost as xgb
import joblib

# For feature importance explanation
try:
    import shap
    SHAP_AVAILABLE = True
except ImportError:
    SHAP_AVAILABLE = False
    print("SHAP not installed - feature explanations will be limited")

load_dotenv()

# Database connection
DATABASE_URL = os.getenv('DATABASE_URL')

# Feature columns to use for training
FEATURE_COLUMNS = [
    # Lead attributes
    'source',
    'work_type',
    'property_type',
    'state',
    'is_self_gen',

    # Engagement signals
    'has_phone',
    'has_email',
    'has_address',

    # Demographic enrichment (from Census)
    'median_household_income',
    'median_home_value',
    'homeownership_rate',
    'median_age',

    # Derived features
    'days_to_contact',  # How fast lead was contacted
    'lead_age_days',    # How old is the lead
]

# Categorical columns that need encoding
CATEGORICAL_COLUMNS = ['source', 'work_type', 'property_type', 'state']


def get_db_connection():
    """Create database connection from DATABASE_URL."""
    return psycopg2.connect(DATABASE_URL)


def load_training_data():
    """
    Load historical lead data with conversion outcomes.
    Target: is_converted (boolean)
    """
    print("Loading training data from database...")

    query = """
    SELECT
        l.id,
        l.lead_source as source,
        l.work_type,
        l.property_type,
        l.state,
        l.is_self_gen,

        -- Engagement features
        CASE WHEN l.phone IS NOT NULL AND l.phone != '' THEN 1 ELSE 0 END as has_phone,
        CASE WHEN l.email IS NOT NULL AND l.email != '' THEN 1 ELSE 0 END as has_email,
        CASE WHEN l.street IS NOT NULL AND l.street != '' THEN 1 ELSE 0 END as has_address,

        -- Demographic enrichment
        l.median_household_income,
        l.median_home_value,
        l.homeownership_rate,
        l.median_age,

        -- Time-based features
        EXTRACT(EPOCH FROM (COALESCE(l.assigned_at, l.created_at) - l.created_at)) / 86400.0 as days_to_contact,
        EXTRACT(EPOCH FROM (NOW() - l.created_at)) / 86400.0 as lead_age_days,

        -- Target variable
        l.is_converted

    FROM leads l
    WHERE l.created_at < NOW() - INTERVAL '30 days'  -- Only use leads old enough to have converted
    ORDER BY l.created_at DESC
    LIMIT 100000
    """

    conn = get_db_connection()
    df = pd.read_sql(query, conn)
    conn.close()

    print(f"Loaded {len(df)} leads")
    print(f"Conversion rate: {df['is_converted'].mean():.2%}")

    return df


def preprocess_features(df, encoders=None, scaler=None, fit=True):
    """
    Preprocess features for model training/inference.

    Args:
        df: DataFrame with raw features
        encoders: Dict of LabelEncoders (None if fitting)
        scaler: StandardScaler (None if fitting)
        fit: Whether to fit encoders/scaler (True for training)

    Returns:
        X: Processed feature matrix
        encoders: Dict of fitted LabelEncoders
        scaler: Fitted StandardScaler
    """
    X = df.copy()

    if fit:
        encoders = {}
        scaler = StandardScaler()

    # Encode categorical variables
    for col in CATEGORICAL_COLUMNS:
        if col in X.columns:
            X[col] = X[col].fillna('Unknown')
            if fit:
                encoders[col] = LabelEncoder()
                X[col] = encoders[col].fit_transform(X[col].astype(str))
            else:
                # Handle unseen categories
                X[col] = X[col].apply(
                    lambda x: x if x in encoders[col].classes_ else 'Unknown'
                )
                X[col] = encoders[col].transform(X[col].astype(str))

    # Fill numeric nulls with median
    numeric_cols = [
        'median_household_income', 'median_home_value',
        'homeownership_rate', 'median_age',
        'days_to_contact', 'lead_age_days'
    ]

    for col in numeric_cols:
        if col in X.columns:
            if fit:
                X[col] = X[col].fillna(X[col].median())
            else:
                X[col] = X[col].fillna(0)

    # Boolean to int
    if 'is_self_gen' in X.columns:
        X['is_self_gen'] = X['is_self_gen'].astype(int)

    # Select only feature columns that exist
    available_features = [c for c in FEATURE_COLUMNS if c in X.columns]
    X = X[available_features]

    # Scale numeric features
    numeric_to_scale = [c for c in numeric_cols if c in X.columns]
    if numeric_to_scale:
        if fit:
            X[numeric_to_scale] = scaler.fit_transform(X[numeric_to_scale])
        else:
            X[numeric_to_scale] = scaler.transform(X[numeric_to_scale])

    return X, encoders, scaler


def train_model(X_train, y_train, X_val, y_val):
    """
    Train XGBoost model with hyperparameter tuning.
    """
    print("\nTraining XGBoost model...")

    # Handle class imbalance (typically more non-converted than converted)
    scale_pos_weight = (y_train == 0).sum() / (y_train == 1).sum()
    print(f"Class imbalance ratio: {scale_pos_weight:.2f}")

    # XGBoost parameters optimized for lead scoring
    params = {
        'objective': 'binary:logistic',
        'eval_metric': 'auc',
        'max_depth': 6,
        'learning_rate': 0.1,
        'n_estimators': 200,
        'min_child_weight': 3,
        'subsample': 0.8,
        'colsample_bytree': 0.8,
        'scale_pos_weight': scale_pos_weight,
        'random_state': 42,
        'use_label_encoder': False,
    }

    model = xgb.XGBClassifier(**params)

    # Train with early stopping
    model.fit(
        X_train, y_train,
        eval_set=[(X_val, y_val)],
        verbose=True
    )

    return model, params


def evaluate_model(model, X_test, y_test, feature_names):
    """
    Evaluate model performance and generate metrics.
    """
    print("\n" + "="*50)
    print("MODEL EVALUATION")
    print("="*50)

    # Predictions
    y_pred = model.predict(X_test)
    y_pred_proba = model.predict_proba(X_test)[:, 1]

    # Metrics
    metrics = {
        'accuracy': accuracy_score(y_test, y_pred),
        'precision': precision_score(y_test, y_pred),
        'recall': recall_score(y_test, y_pred),
        'f1': f1_score(y_test, y_pred),
        'auc_roc': roc_auc_score(y_test, y_pred_proba),
    }

    print(f"\nAccuracy:  {metrics['accuracy']:.4f}")
    print(f"Precision: {metrics['precision']:.4f}")
    print(f"Recall:    {metrics['recall']:.4f}")
    print(f"F1 Score:  {metrics['f1']:.4f}")
    print(f"AUC-ROC:   {metrics['auc_roc']:.4f}")

    print("\nClassification Report:")
    print(classification_report(y_test, y_pred, target_names=['Not Converted', 'Converted']))

    print("\nConfusion Matrix:")
    print(confusion_matrix(y_test, y_pred))

    # Feature importance
    print("\nTop 10 Feature Importances:")
    importance = pd.DataFrame({
        'feature': feature_names,
        'importance': model.feature_importances_
    }).sort_values('importance', ascending=False)

    print(importance.head(10).to_string(index=False))

    # SHAP values for explainability
    shap_values = None
    if SHAP_AVAILABLE:
        print("\nCalculating SHAP values for explainability...")
        try:
            explainer = shap.TreeExplainer(model)
            shap_values = explainer.shap_values(X_test[:1000])  # Sample for speed

            # Get feature importance from SHAP
            shap_importance = pd.DataFrame({
                'feature': feature_names,
                'shap_importance': np.abs(shap_values).mean(axis=0)
            }).sort_values('shap_importance', ascending=False)

            print("\nSHAP Feature Importances:")
            print(shap_importance.head(10).to_string(index=False))
        except Exception as e:
            print(f"SHAP calculation failed: {e}")

    return metrics, importance.to_dict('records')


def save_model(model, encoders, scaler, metrics, feature_importance, output_dir):
    """
    Save trained model and metadata.
    """
    output_path = Path(output_dir)
    output_path.mkdir(parents=True, exist_ok=True)

    timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
    version = 1

    # Save model
    model_file = output_path / f'lead_scoring_model_v{version}.joblib'
    joblib.dump(model, model_file)
    print(f"\nModel saved to: {model_file}")

    # Save encoders and scaler
    preprocessing_file = output_path / f'preprocessing_v{version}.joblib'
    joblib.dump({'encoders': encoders, 'scaler': scaler}, preprocessing_file)
    print(f"Preprocessing saved to: {preprocessing_file}")

    # Save metadata
    metadata = {
        'name': 'Lead Scoring XGBoost',
        'version': version,
        'model_type': 'xgboost',
        'trained_at': timestamp,
        'metrics': metrics,
        'feature_importance': feature_importance[:20],  # Top 20
        'feature_columns': FEATURE_COLUMNS,
        'categorical_columns': CATEGORICAL_COLUMNS,
    }

    metadata_file = output_path / f'model_metadata_v{version}.json'
    with open(metadata_file, 'w') as f:
        json.dump(metadata, f, indent=2, default=str)
    print(f"Metadata saved to: {metadata_file}")

    return metadata


def register_model_in_db(metadata, training_stats):
    """
    Register the trained model in the database for the scoring service to use.
    """
    print("\nRegistering model in database...")

    conn = get_db_connection()
    cur = conn.cursor()

    # Deactivate previous models
    cur.execute("UPDATE lead_scoring_models SET is_active = FALSE WHERE is_active = TRUE")

    # Insert new model
    cur.execute("""
        INSERT INTO lead_scoring_models (
            id, name, version, model_type,
            trained_at, training_samples, training_positives, training_negatives,
            accuracy, precision_score, recall_score, f1_score, auc_roc,
            feature_importance, hyperparameters, feature_columns,
            is_active, deployed_at
        ) VALUES (
            gen_random_uuid()::text, %s, %s, %s,
            %s, %s, %s, %s,
            %s, %s, %s, %s, %s,
            %s, %s, %s,
            TRUE, NOW()
        )
    """, (
        metadata['name'],
        metadata['version'],
        metadata['model_type'],
        datetime.now(),
        training_stats['total'],
        training_stats['positives'],
        training_stats['negatives'],
        metadata['metrics']['accuracy'],
        metadata['metrics']['precision'],
        metadata['metrics']['recall'],
        metadata['metrics']['f1'],
        metadata['metrics']['auc_roc'],
        json.dumps(metadata['feature_importance']),
        json.dumps({}),  # hyperparameters
        json.dumps(metadata['feature_columns']),
    ))

    conn.commit()
    cur.close()
    conn.close()

    print("Model registered and activated!")


def main():
    parser = argparse.ArgumentParser(description='Train Lead Scoring Model')
    parser.add_argument('--output', default='./models', help='Output directory for model files')
    parser.add_argument('--evaluate', action='store_true', help='Run detailed evaluation')
    parser.add_argument('--register', action='store_true', help='Register model in database')
    args = parser.parse_args()

    print("="*60)
    print("LEAD SCORING MODEL TRAINING PIPELINE")
    print("="*60)

    # Load data
    df = load_training_data()

    if len(df) < 1000:
        print(f"WARNING: Only {len(df)} samples. Need more data for reliable model.")
        if len(df) < 100:
            print("ERROR: Insufficient data. Need at least 100 samples.")
            sys.exit(1)

    # Check conversion distribution
    positives = df['is_converted'].sum()
    negatives = len(df) - positives
    print(f"\nTraining data: {positives} converted, {negatives} not converted")

    if positives < 50:
        print("WARNING: Very few converted leads. Model may not generalize well.")

    # Prepare features and target
    y = df['is_converted'].astype(int)
    X_raw = df.drop(columns=['id', 'is_converted'])

    # Preprocess
    X, encoders, scaler = preprocess_features(X_raw, fit=True)
    feature_names = X.columns.tolist()

    print(f"\nFeatures used: {len(feature_names)}")
    print(feature_names)

    # Train/test split
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y
    )

    # Further split training for validation
    X_train, X_val, y_train, y_val = train_test_split(
        X_train, y_train, test_size=0.2, random_state=42, stratify=y_train
    )

    print(f"\nTrain: {len(X_train)}, Val: {len(X_val)}, Test: {len(X_test)}")

    # Train model
    model, params = train_model(X_train, y_train, X_val, y_val)

    # Evaluate
    if args.evaluate:
        metrics, feature_importance = evaluate_model(model, X_test, y_test, feature_names)
    else:
        # Quick metrics
        y_pred_proba = model.predict_proba(X_test)[:, 1]
        metrics = {
            'accuracy': accuracy_score(y_test, model.predict(X_test)),
            'auc_roc': roc_auc_score(y_test, y_pred_proba),
            'precision': precision_score(y_test, model.predict(X_test)),
            'recall': recall_score(y_test, model.predict(X_test)),
            'f1': f1_score(y_test, model.predict(X_test)),
        }
        feature_importance = [
            {'feature': f, 'importance': float(i)}
            for f, i in zip(feature_names, model.feature_importances_)
        ]

    # Save model
    metadata = save_model(model, encoders, scaler, metrics, feature_importance, args.output)

    # Register in database
    if args.register:
        training_stats = {
            'total': len(df),
            'positives': int(positives),
            'negatives': int(negatives),
        }
        register_model_in_db(metadata, training_stats)

    print("\n" + "="*60)
    print("TRAINING COMPLETE")
    print("="*60)
    print(f"AUC-ROC: {metrics['auc_roc']:.4f}")
    print(f"Model saved to: {args.output}")

    if metrics['auc_roc'] >= 0.7:
        print("\n✅ Model performance is GOOD (AUC >= 0.7)")
    elif metrics['auc_roc'] >= 0.6:
        print("\n⚠️ Model performance is FAIR (AUC 0.6-0.7)")
    else:
        print("\n❌ Model performance is POOR (AUC < 0.6) - need more/better data")


if __name__ == '__main__':
    main()
