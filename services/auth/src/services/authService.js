// Auth Service - Cognito Authentication Operations
import {
  CognitoIdentityProviderClient,
  InitiateAuthCommand,
  RespondToAuthChallengeCommand,
  SignUpCommand,
  ConfirmSignUpCommand,
  ForgotPasswordCommand,
  ConfirmForgotPasswordCommand,
  GetUserCommand,
  GlobalSignOutCommand,
  AdminCreateUserCommand,
  AdminSetUserPasswordCommand,
  AdminUpdateUserAttributesCommand,
  AdminGetUserCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import crypto from 'crypto';

const region = process.env.AWS_REGION || 'us-east-2';

// Cognito client
const cognitoClient = new CognitoIdentityProviderClient({ region });
const secretsClient = new SecretsManagerClient({ region });

// Cached credentials
let cognitoCredentials = null;

async function getCognitoCredentials() {
  if (cognitoCredentials) return cognitoCredentials;

  try {
    const response = await secretsClient.send(
      new GetSecretValueCommand({ SecretId: 'panda-crm/cognito' })
    );
    cognitoCredentials = JSON.parse(response.SecretString);
    return cognitoCredentials;
  } catch (error) {
    console.error('Failed to get Cognito credentials:', error);
    // Fall back to environment variables
    return {
      userPoolId: process.env.COGNITO_USER_POOL_ID,
      clientId: process.env.COGNITO_CLIENT_ID,
      clientSecret: process.env.COGNITO_CLIENT_SECRET,
    };
  }
}

// Calculate secret hash for Cognito (required when app client has a secret)
function calculateSecretHash(username, clientId, clientSecret) {
  return crypto
    .createHmac('sha256', clientSecret)
    .update(username + clientId)
    .digest('base64');
}

export const authService = {
  /**
   * Authenticate user with email and password
   */
  async login(email, password) {
    const creds = await getCognitoCredentials();

    const params = {
      AuthFlow: 'USER_PASSWORD_AUTH',
      ClientId: creds.clientId,
      AuthParameters: {
        USERNAME: email,
        PASSWORD: password,
        SECRET_HASH: calculateSecretHash(email, creds.clientId, creds.clientSecret),
      },
    };

    try {
      const response = await cognitoClient.send(new InitiateAuthCommand(params));

      // Handle NEW_PASSWORD_REQUIRED challenge
      if (response.ChallengeName === 'NEW_PASSWORD_REQUIRED') {
        return {
          challengeName: 'NEW_PASSWORD_REQUIRED',
          session: response.Session,
          userAttributes: JSON.parse(response.ChallengeParameters.userAttributes || '{}'),
        };
      }

      return {
        accessToken: response.AuthenticationResult.AccessToken,
        idToken: response.AuthenticationResult.IdToken,
        refreshToken: response.AuthenticationResult.RefreshToken,
        expiresIn: response.AuthenticationResult.ExpiresIn,
      };
    } catch (error) {
      // Re-throw Cognito errors with their original name so errorHandler can process them
      throw error;
    }
  },

  /**
   * Complete NEW_PASSWORD_REQUIRED challenge
   */
  async completeNewPasswordChallenge(email, newPassword, session) {
    const creds = await getCognitoCredentials();

    const params = {
      ChallengeName: 'NEW_PASSWORD_REQUIRED',
      ClientId: creds.clientId,
      ChallengeResponses: {
        USERNAME: email,
        NEW_PASSWORD: newPassword,
        SECRET_HASH: calculateSecretHash(email, creds.clientId, creds.clientSecret),
      },
      Session: session,
    };

    const response = await cognitoClient.send(new RespondToAuthChallengeCommand(params));

    return {
      accessToken: response.AuthenticationResult.AccessToken,
      idToken: response.AuthenticationResult.IdToken,
      refreshToken: response.AuthenticationResult.RefreshToken,
      expiresIn: response.AuthenticationResult.ExpiresIn,
    };
  },

  /**
   * Refresh access token using refresh token
   * IMPORTANT: Cognito requires the UUID username (not email) for SECRET_HASH calculation
   */
  async refreshToken(refreshToken, email) {
    const creds = await getCognitoCredentials();

    // Look up the Cognito UUID username from the email
    // Cognito requires the UUID (not email) for SECRET_HASH during refresh
    let cognitoUsername = email;
    try {
      const userResponse = await cognitoClient.send(
        new AdminGetUserCommand({
          UserPoolId: creds.userPoolId,
          Username: email,
        })
      );
      cognitoUsername = userResponse.Username; // This is the UUID
    } catch (error) {
      console.warn('Could not look up Cognito username, falling back to email:', error.message);
    }

    const params = {
      AuthFlow: 'REFRESH_TOKEN_AUTH',
      ClientId: creds.clientId,
      AuthParameters: {
        REFRESH_TOKEN: refreshToken,
        SECRET_HASH: calculateSecretHash(cognitoUsername, creds.clientId, creds.clientSecret),
      },
    };

    const response = await cognitoClient.send(new InitiateAuthCommand(params));

    return {
      accessToken: response.AuthenticationResult.AccessToken,
      idToken: response.AuthenticationResult.IdToken,
      expiresIn: response.AuthenticationResult.ExpiresIn,
    };
  },

  /**
   * Register a new user
   */
  async signUp(email, password, name, attributes = {}) {
    const creds = await getCognitoCredentials();

    const userAttributes = [
      { Name: 'email', Value: email },
      { Name: 'name', Value: name },
    ];

    if (attributes.role) {
      userAttributes.push({ Name: 'custom:role', Value: attributes.role });
    }
    if (attributes.department) {
      userAttributes.push({ Name: 'custom:department', Value: attributes.department });
    }
    if (attributes.salesforceId) {
      userAttributes.push({ Name: 'custom:salesforce_id', Value: attributes.salesforceId });
    }

    const params = {
      ClientId: creds.clientId,
      Username: email,
      Password: password,
      SecretHash: calculateSecretHash(email, creds.clientId, creds.clientSecret),
      UserAttributes: userAttributes,
    };

    await cognitoClient.send(new SignUpCommand(params));

    return { message: 'User registered successfully. Please check your email for verification code.' };
  },

  /**
   * Confirm user registration with verification code
   */
  async confirmSignUp(email, code) {
    const creds = await getCognitoCredentials();

    const params = {
      ClientId: creds.clientId,
      Username: email,
      ConfirmationCode: code,
      SecretHash: calculateSecretHash(email, creds.clientId, creds.clientSecret),
    };

    await cognitoClient.send(new ConfirmSignUpCommand(params));

    return { message: 'Email verified successfully. You can now log in.' };
  },

  /**
   * Initiate forgot password flow
   */
  async forgotPassword(email) {
    const creds = await getCognitoCredentials();

    const params = {
      ClientId: creds.clientId,
      Username: email,
      SecretHash: calculateSecretHash(email, creds.clientId, creds.clientSecret),
    };

    await cognitoClient.send(new ForgotPasswordCommand(params));

    return { message: 'Password reset code sent to your email.' };
  },

  /**
   * Confirm forgot password with new password
   */
  async confirmForgotPassword(email, code, newPassword) {
    const creds = await getCognitoCredentials();

    const params = {
      ClientId: creds.clientId,
      Username: email,
      ConfirmationCode: code,
      Password: newPassword,
      SecretHash: calculateSecretHash(email, creds.clientId, creds.clientSecret),
    };

    await cognitoClient.send(new ConfirmForgotPasswordCommand(params));

    return { message: 'Password reset successfully. You can now log in with your new password.' };
  },

  /**
   * Get current user info from access token
   */
  async getCurrentUser(accessToken) {
    const response = await cognitoClient.send(
      new GetUserCommand({ AccessToken: accessToken })
    );

    const attributes = {};
    response.UserAttributes.forEach((attr) => {
      attributes[attr.Name] = attr.Value;
    });

    // Build name from given_name/family_name if name attribute not present
    const name = attributes.name ||
      (attributes.given_name && attributes.family_name
        ? `${attributes.given_name} ${attributes.family_name}`
        : attributes.given_name || attributes.family_name || null);

    return {
      username: response.Username,
      email: attributes.email,
      name,
      firstName: attributes.given_name,
      lastName: attributes.family_name,
      role: attributes['custom:role'] || attributes['custom:custom:role'],
      department: attributes['custom:department'] || attributes['custom:custom:department'],
      salesforceId: attributes['custom:salesforce_id'] || attributes['custom:custom:salesforce_id'],
      emailVerified: attributes.email_verified === 'true',
    };
  },

  /**
   * Sign out user globally (invalidate all tokens)
   */
  async signOut(accessToken) {
    await cognitoClient.send(new GlobalSignOutCommand({ AccessToken: accessToken }));
    return { message: 'Signed out successfully.' };
  },

  // Admin operations (for service-to-service calls)

  /**
   * Admin: Create a new user
   */
  async adminCreateUser(email, name, temporaryPassword, attributes = {}) {
    const creds = await getCognitoCredentials();

    const userAttributes = [
      { Name: 'email', Value: email },
      { Name: 'email_verified', Value: 'true' },
      { Name: 'name', Value: name },
    ];

    if (attributes.role) {
      userAttributes.push({ Name: 'custom:role', Value: attributes.role });
    }
    if (attributes.department) {
      userAttributes.push({ Name: 'custom:department', Value: attributes.department });
    }
    if (attributes.salesforceId) {
      userAttributes.push({ Name: 'custom:salesforce_id', Value: attributes.salesforceId });
    }

    await cognitoClient.send(
      new AdminCreateUserCommand({
        UserPoolId: creds.userPoolId,
        Username: email,
        TemporaryPassword: temporaryPassword,
        UserAttributes: userAttributes,
        MessageAction: 'SUPPRESS', // Don't send welcome email
      })
    );

    return { message: 'User created successfully.' };
  },

  /**
   * Admin: Set permanent password for user
   */
  async adminSetPassword(email, password) {
    const creds = await getCognitoCredentials();

    await cognitoClient.send(
      new AdminSetUserPasswordCommand({
        UserPoolId: creds.userPoolId,
        Username: email,
        Password: password,
        Permanent: true,
      })
    );

    return { message: 'Password set successfully.' };
  },

  /**
   * Admin: Update user attributes
   */
  async adminUpdateUserAttributes(email, attributes) {
    const creds = await getCognitoCredentials();

    const userAttributes = [];
    if (attributes.name) userAttributes.push({ Name: 'name', Value: attributes.name });
    if (attributes.role) userAttributes.push({ Name: 'custom:role', Value: attributes.role });
    if (attributes.department) userAttributes.push({ Name: 'custom:department', Value: attributes.department });
    if (attributes.salesforceId) userAttributes.push({ Name: 'custom:salesforce_id', Value: attributes.salesforceId });

    await cognitoClient.send(
      new AdminUpdateUserAttributesCommand({
        UserPoolId: creds.userPoolId,
        Username: email,
        UserAttributes: userAttributes,
      })
    );

    return { message: 'User attributes updated successfully.' };
  },

  /**
   * Admin: Get user by email
   */
  async adminGetUser(email) {
    const creds = await getCognitoCredentials();

    const response = await cognitoClient.send(
      new AdminGetUserCommand({
        UserPoolId: creds.userPoolId,
        Username: email,
      })
    );

    const attributes = {};
    response.UserAttributes.forEach((attr) => {
      attributes[attr.Name] = attr.Value;
    });

    return {
      username: response.Username,
      email: attributes.email,
      name: attributes.name,
      role: attributes['custom:role'] || attributes['custom:custom:role'],
      department: attributes['custom:department'] || attributes['custom:custom:department'],
      salesforceId: attributes['custom:salesforce_id'] || attributes['custom:custom:salesforce_id'],
      status: response.UserStatus,
      enabled: response.Enabled,
      createdAt: response.UserCreateDate,
      lastModified: response.UserLastModifiedDate,
    };
  },

  // ============================================================================
  // MOBILE APP - Push Token Management
  // ============================================================================

  /**
   * Save push notification token for a user
   * Stores in User.pushTokens JSON field for sending notifications via Expo Push API
   */
  async savePushToken(userId, token, platform = 'unknown') {
    // Import prisma here to avoid circular dependency issues
    const { PrismaClient } = await import('@prisma/client');
    const prisma = new PrismaClient();

    try {
      // Get current push tokens
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { pushTokens: true },
      });

      let tokens = Array.isArray(user?.pushTokens) ? user.pushTokens : [];

      // Check if token already exists
      const existingIndex = tokens.findIndex(t => t.token === token);
      if (existingIndex >= 0) {
        // Update existing token
        tokens[existingIndex] = {
          ...tokens[existingIndex],
          platform,
          updatedAt: new Date().toISOString(),
          active: true,
        };
      } else {
        // Add new token
        tokens.push({
          token,
          platform,
          createdAt: new Date().toISOString(),
          active: true,
        });
      }

      // Save updated tokens
      await prisma.user.update({
        where: { id: userId },
        data: { pushTokens: tokens },
      });

      return { success: true };
    } finally {
      await prisma.$disconnect();
    }
  },

  /**
   * Remove push notification token for a user
   * Called on logout or when notifications are disabled
   */
  async removePushToken(userId, token) {
    const { PrismaClient } = await import('@prisma/client');
    const prisma = new PrismaClient();

    try {
      // Get current push tokens
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { pushTokens: true },
      });

      let tokens = Array.isArray(user?.pushTokens) ? user.pushTokens : [];

      if (token) {
        // Mark specific token as inactive
        tokens = tokens.map(t =>
          t.token === token ? { ...t, active: false } : t
        );
      } else {
        // Mark all tokens as inactive
        tokens = tokens.map(t => ({ ...t, active: false }));
      }

      // Save updated tokens
      await prisma.user.update({
        where: { id: userId },
        data: { pushTokens: tokens },
      });

      return { success: true };
    } finally {
      await prisma.$disconnect();
    }
  },

  /**
   * Get active push tokens for a user
   * Used by notification service to send push notifications
   */
  async getUserPushTokens(userId) {
    const { PrismaClient } = await import('@prisma/client');
    const prisma = new PrismaClient();

    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { pushTokens: true },
      });

      const tokens = Array.isArray(user?.pushTokens) ? user.pushTokens : [];

      // Return only active tokens
      return tokens
        .filter(t => t.active)
        .map(t => ({ token: t.token, platform: t.platform }));
    } finally {
      await prisma.$disconnect();
    }
  },
};

export default authService;
