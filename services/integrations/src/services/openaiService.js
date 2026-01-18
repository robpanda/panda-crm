// OpenAI Service - GPT-4 Integration for AI-powered features
import logger from '../utils/logger.js';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_PROJECT_ID = process.env.OPENAI_PROJECT_ID || 'proj_rmR3DUh00G2TZJG0qhJNWXJe';
const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';

/**
 * Generate AI summary of opportunity activity
 * @param {Object} params - Parameters for summary generation
 * @param {Array} params.activities - Array of activity items (notes, tasks, events)
 * @param {Object} params.opportunity - Opportunity details
 * @param {Object} params.context - Additional context (stage, type, etc.)
 * @returns {Promise<string>} AI-generated summary
 */
export async function generateActivitySummary({ activities, opportunity, context }) {
  if (!OPENAI_API_KEY) {
    logger.warn('OpenAI API key not configured');
    return null;
  }

  try {
    const prompt = buildActivitySummaryPrompt(activities, opportunity, context);

    const response = await fetch(OPENAI_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'OpenAI-Project': OPENAI_PROJECT_ID,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'You are an AI assistant for Panda Exteriors CRM. Provide concise, actionable summaries of job activity and workflow progress. Focus on key updates, blockers, and next steps.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.3,
        max_tokens: 300,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      logger.error('OpenAI API error:', error);
      return null;
    }

    const data = await response.json();
    return data.choices[0]?.message?.content || null;
  } catch (error) {
    logger.error('Error generating activity summary:', error);
    return null;
  }
}

/**
 * Generate AI suggestions for next steps based on workflow context
 * @param {Object} params - Parameters for next step generation
 * @param {Object} params.opportunity - Opportunity details
 * @param {Array} params.activities - Recent activity items
 * @param {Array} params.teamMembers - Available team members for @mentions
 * @returns {Promise<Object>} AI-generated suggestions (nextSteps, suggestedMentions, draftMessage)
 */
export async function generateNextStepSuggestions({ opportunity, activities, teamMembers }) {
  if (!OPENAI_API_KEY) {
    logger.warn('OpenAI API key not configured');
    return null;
  }

  try {
    const prompt = buildNextStepPrompt(opportunity, activities, teamMembers);

    const response = await fetch(OPENAI_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'OpenAI-Project': OPENAI_PROJECT_ID,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: `You are an AI workflow assistant for Panda Exteriors CRM. Based on the job stage, recent activity, and team roles, suggest next steps and who should be notified. Return responses in JSON format with: nextSteps (array of strings), suggestedMentions (array of {userId, reason}), and draftMessage (string).`
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.4,
        max_tokens: 500,
        response_format: { type: 'json_object' }
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      logger.error('OpenAI API error:', error);
      return null;
    }

    const data = await response.json();
    const content = data.choices[0]?.message?.content;

    if (!content) return null;

    return JSON.parse(content);
  } catch (error) {
    logger.error('Error generating next step suggestions:', error);
    return null;
  }
}

/**
 * Generate AI-drafted message based on context
 * @param {Object} params - Parameters for message generation
 * @param {string} params.intent - User's intent or partial message
 * @param {Object} params.opportunity - Opportunity details
 * @param {Array} params.recentActivity - Recent activity for context
 * @returns {Promise<string>} AI-generated draft message
 */
export async function generateDraftMessage({ intent, opportunity, recentActivity }) {
  if (!OPENAI_API_KEY) {
    logger.warn('OpenAI API key not configured');
    return null;
  }

  try {
    const prompt = buildDraftMessagePrompt(intent, opportunity, recentActivity);

    const response = await fetch(OPENAI_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'OpenAI-Project': OPENAI_PROJECT_ID,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'You are an AI writing assistant for Panda Exteriors CRM. Draft professional, concise updates for internal team communication. Keep messages brief and actionable.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.5,
        max_tokens: 200,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      logger.error('OpenAI API error:', error);
      return null;
    }

    const data = await response.json();
    return data.choices[0]?.message?.content || null;
  } catch (error) {
    logger.error('Error generating draft message:', error);
    return null;
  }
}

// Helper function to build activity summary prompt
function buildActivitySummaryPrompt(activities, opportunity, context) {
  const activitySummary = activities.slice(0, 10).map(a =>
    `- [${a.type}] ${a.subject || a.title}: ${a.body || ''} (${new Date(a.createdAt).toLocaleDateString()})`
  ).join('\n');

  return `Summarize the current status and recent activity for this roofing job:

Job: ${opportunity.name}
Stage: ${opportunity.stage}
Type: ${opportunity.type || 'Insurance'}
Status: ${opportunity.status || 'Active'}

Recent Activity:
${activitySummary || 'No recent activity'}

Provide a 2-3 sentence summary highlighting: current progress, any blockers or issues mentioned, and what appears to be the next step in the workflow.`;
}

// Helper function to build next step prompt
function buildNextStepPrompt(opportunity, activities, teamMembers) {
  const activitySummary = activities.slice(0, 5).map(a =>
    `- ${a.type}: ${a.subject || a.title}`
  ).join('\n');

  const teamSummary = teamMembers.map(m =>
    `- ${m.firstName} ${m.lastName} (${m.role || 'Team Member'}) - ID: ${m.id}`
  ).join('\n');

  return `Analyze this roofing job and suggest next steps:

Job: ${opportunity.name}
Stage: ${opportunity.stage}
Type: ${opportunity.type || 'Insurance'}

Recent Activity:
${activitySummary || 'No activity'}

Available Team Members:
${teamSummary}

Common workflow stages: LEAD_ASSIGNED → SCHEDULED → INSPECTED → CLAIM_FILED → APPROVED → CONTRACT_SIGNED → IN_PRODUCTION → COMPLETED

Return JSON with:
- nextSteps: array of 2-3 specific action items based on current stage
- suggestedMentions: array of {userId, reason} for team members who should be notified
- draftMessage: a brief update message (1-2 sentences) announcing next steps`;
}

// Helper function to build draft message prompt
function buildDraftMessagePrompt(intent, opportunity, recentActivity) {
  const recentSummary = recentActivity.slice(0, 3).map(a =>
    `- ${a.type}: ${a.subject || a.title}`
  ).join('\n');

  return `Draft a professional internal update message for this roofing job:

Job: ${opportunity.name}
Stage: ${opportunity.stage}

User's intent or partial message: "${intent}"

Recent context:
${recentSummary || 'No recent activity'}

Write a clear, professional message (1-2 sentences) that communicates the update or next step. Do not include @mentions in the draft.`;
}

export default {
  generateActivitySummary,
  generateNextStepSuggestions,
  generateDraftMessage,
};
