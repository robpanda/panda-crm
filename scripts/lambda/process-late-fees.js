/**
 * AWS Lambda: Process Late Fees
 *
 * This Lambda function runs daily to add late fees to overdue invoices.
 * Late fees are added every 30 days: at 30, 60, 90+ days overdue.
 *
 * Logic:
 * - Find all invoices with balanceDue > 0 and dueDate < today
 * - Calculate days overdue and determine which 30-day period
 * - If late fee count < period count, add a new late fee
 * - Late fee = balanceDue * lateFeePercent (default 1.5%)
 *
 * Environment Variables:
 * - DATABASE_URL: PostgreSQL connection string
 * - DEFAULT_LATE_FEE_PERCENT: Default late fee percentage (1.5)
 *
 * Trigger: CloudWatch Events / EventBridge Rule
 * Schedule: cron(0 8 * * ? *) - Daily at 8 AM UTC (3 AM EST)
 */

const pg = require('pg');

const DEFAULT_LATE_FEE_PERCENT = parseFloat(process.env.DEFAULT_LATE_FEE_PERCENT || '1.5');

exports.handler = async function(event, context) {
  console.log('Starting late fee processing...');
  console.log(`Default late fee percent: ${DEFAULT_LATE_FEE_PERCENT}%`);

  const client = new pg.Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log('Connected to database');

    // Get today's date at midnight for consistent comparison
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Find all overdue invoices with balance due > 0
    const overdueResult = await client.query(`
      SELECT
        i.id,
        i.invoice_number,
        i.due_date,
        i.balance_due,
        i.total,
        i.status,
        i.account_id,
        a.name as account_name,
        a.late_fee_percent as account_late_fee_percent,
        (
          SELECT COUNT(*)
          FROM invoice_additional_charges iac
          WHERE iac.invoice_id = i.id
          AND iac.charge_type = 'LATE_FEE'
        ) as existing_late_fees
      FROM invoices i
      JOIN accounts a ON i.account_id = a.id
      WHERE i.status NOT IN ('PAID', 'CANCELLED', 'VOID')
        AND i.due_date < $1
        AND i.balance_due > 0
      ORDER BY i.due_date ASC
    `, [today]);

    const overdueInvoices = overdueResult.rows;
    console.log(`Found ${overdueInvoices.length} overdue invoices to evaluate`);

    const results = {
      processed: 0,
      lateFeeAdded: 0,
      skipped: 0,
      errors: [],
      details: []
    };

    for (const invoice of overdueInvoices) {
      try {
        const dueDate = new Date(invoice.due_date);
        const daysOverdue = Math.floor((today - dueDate) / (1000 * 60 * 60 * 24));

        // Calculate which 30-day period we're in (1 = 30 days, 2 = 60 days, 3 = 90 days, etc.)
        const lateFeePeriod = Math.floor(daysOverdue / 30);

        if (lateFeePeriod < 1) {
          // Not yet 30 days overdue
          results.skipped++;
          continue;
        }

        const existingLateFees = parseInt(invoice.existing_late_fees) || 0;

        // Check if we need to add a new late fee
        if (existingLateFees >= lateFeePeriod) {
          // Already have the appropriate number of late fees
          console.log(`Invoice ${invoice.invoice_number}: Already has ${existingLateFees} late fees for ${daysOverdue} days overdue`);
          results.skipped++;
          continue;
        }

        // Calculate late fee amount
        const lateFeePercent = parseFloat(invoice.account_late_fee_percent) || DEFAULT_LATE_FEE_PERCENT;
        const balanceDue = parseFloat(invoice.balance_due);
        const lateFeeAmount = balanceDue * (lateFeePercent / 100);

        // Create the late fee charge
        const chargeId = `lf_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        await client.query(`
          INSERT INTO invoice_additional_charges (
            id, invoice_id, name, charge_type, percentage_of_total,
            amount, balance_at_time, days_overdue, notes, created_at, updated_at
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW()
          )
        `, [
          chargeId,
          invoice.id,
          `Late Fee (${daysOverdue} days overdue)`,
          'LATE_FEE',
          lateFeePercent,
          lateFeeAmount,
          balanceDue,
          daysOverdue,
          `Auto-generated late fee: ${lateFeePercent}% of $${balanceDue.toFixed(2)} balance`
        ]);

        // Update invoice totals
        const newTotal = parseFloat(invoice.total) + lateFeeAmount;
        const newBalanceDue = balanceDue + lateFeeAmount;

        await client.query(`
          UPDATE invoices
          SET total = $1,
              balance_due = $2,
              status = 'OVERDUE',
              updated_at = NOW()
          WHERE id = $3
        `, [newTotal, newBalanceDue, invoice.id]);

        console.log(`Added late fee to ${invoice.invoice_number}: $${lateFeeAmount.toFixed(2)} (${lateFeePercent}% of $${balanceDue.toFixed(2)})`);

        results.lateFeeAdded++;
        results.processed++;
        results.details.push({
          invoiceNumber: invoice.invoice_number,
          accountName: invoice.account_name,
          daysOverdue,
          lateFeeAmount: lateFeeAmount.toFixed(2),
          newBalanceDue: newBalanceDue.toFixed(2)
        });

      } catch (invoiceError) {
        console.error(`Error processing late fee for invoice ${invoice.id}:`, invoiceError);
        results.errors.push({
          invoiceId: invoice.id,
          invoiceNumber: invoice.invoice_number,
          error: invoiceError.message
        });
      }
    }

    const summary = {
      processed: results.processed,
      lateFeeAdded: results.lateFeeAdded,
      skipped: results.skipped,
      errors: results.errors.length,
      timestamp: new Date().toISOString()
    };

    console.log('Late fee processing complete:', summary);

    // Log details of fees added
    if (results.details.length > 0) {
      console.log('Late fees added:');
      for (const detail of results.details) {
        console.log(`  - ${detail.invoiceNumber} (${detail.accountName}): $${detail.lateFeeAmount} (${detail.daysOverdue} days overdue)`);
      }
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        ...summary,
        details: results.details
      })
    };

  } catch (error) {
    console.error('Lambda error:', error);
    throw error;
  } finally {
    await client.end();
  }
};
