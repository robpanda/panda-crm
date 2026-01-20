/**
 * Learning Engine for Training Bot
 * Analyzes user interactions to improve responses and identify system issues
 */

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, QueryCommand, ScanCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');

const dynamoClient = new DynamoDBClient({ region: 'us-east-2' });
const docClient = DynamoDBDocumentClient.from(dynamoClient);

const CHAT_LOGS_TABLE = 'panda-crm-training-bot-logs';
const LEARNING_PATTERNS_TABLE = 'panda-crm-training-patterns';

/**
 * Analyze chat logs to identify patterns and issues
 * Run this periodically (e.g., daily via CloudWatch Events)
 */
async function analyzeChatPatterns() {
  try {
    // Get all chat logs from the last 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const logs = await getAllRecentLogs(thirtyDaysAgo.toISOString());

    const analysis = {
      timestamp: new Date().toISOString(),
      totalInteractions: logs.length,
      patterns: {
        commonQuestions: identifyCommonQuestions(logs),
        unhelpfulResponses: identifyUnhelpfulResponses(logs),
        frequentPaths: identifyFrequentPaths(logs),
        topIssues: identifyTopIssues(logs),
        userBehavior: analyzeUserBehavior(logs),
        knowledgeGaps: identifyKnowledgeGaps(logs),
      },
      recommendations: [],
    };

    // Generate recommendations
    analysis.recommendations = generateRecommendations(analysis.patterns);

    // Store patterns for future reference
    await storePatterns(analysis);

    return analysis;
  } catch (error) {
    console.error('Error analyzing chat patterns:', error);
    throw error;
  }
}

/**
 * Get all recent logs from DynamoDB
 */
async function getAllRecentLogs(sinceDate) {
  const logs = [];
  let lastEvaluatedKey = null;

  do {
    const params = {
      TableName: CHAT_LOGS_TABLE,
      FilterExpression: 'timestamp >= :since',
      ExpressionAttributeValues: {
        ':since': sinceDate,
      },
      ExclusiveStartKey: lastEvaluatedKey,
    };

    const result = await docClient.send(new ScanCommand(params));
    logs.push(...(result.Items || []));
    lastEvaluatedKey = result.LastEvaluatedKey;
  } while (lastEvaluatedKey);

  return logs;
}

/**
 * Identify the most common questions users ask
 */
function identifyCommonQuestions(logs) {
  const questionCounts = {};

  logs.forEach(log => {
    const message = normalizeQuestion(log.message);
    questionCounts[message] = (questionCounts[message] || 0) + 1;
  });

  // Sort by frequency and return top 20
  return Object.entries(questionCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([question, count]) => ({
      question,
      count,
      percentage: ((count / logs.length) * 100).toFixed(2),
    }));
}

/**
 * Normalize question for pattern matching
 */
function normalizeQuestion(message) {
  if (!message) return '';

  return message
    .toLowerCase()
    .replace(/[?!.,]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .substring(0, 100); // Truncate long messages
}

/**
 * Identify responses that were marked as unhelpful
 */
function identifyUnhelpfulResponses(logs) {
  const unhelpful = logs.filter(log => log.helpful === false);
  const patterns = {};

  unhelpful.forEach(log => {
    const key = `${normalizeQuestion(log.message)}`;
    if (!patterns[key]) {
      patterns[key] = {
        question: log.message,
        response: log.response,
        count: 0,
        examples: [],
      };
    }
    patterns[key].count++;
    if (patterns[key].examples.length < 3) {
      patterns[key].examples.push({
        path: log.currentPath,
        userRole: log.userRole,
        timestamp: log.timestamp,
      });
    }
  });

  return Object.values(patterns)
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);
}

/**
 * Identify which pages users get help on most frequently
 */
function identifyFrequentPaths(logs) {
  const pathCounts = {};

  logs.forEach(log => {
    const path = log.currentPath || '/';
    pathCounts[path] = (pathCounts[path] || 0) + 1;
  });

  return Object.entries(pathCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([path, count]) => ({
      path,
      count,
      percentage: ((count / logs.length) * 100).toFixed(2),
    }));
}

/**
 * Identify top issues users are experiencing
 */
function identifyTopIssues(logs) {
  const issueKeywords = {
    'Cannot Find': ['cannot find', "can't find", 'where is', 'missing', 'lost', 'dont see'],
    'Not Working': ['not working', 'broken', 'error', 'issue', 'problem', 'bug'],
    'Not Saving': ['not saving', 'wont save', "doesn't save", 'save failed'],
    'Loading Issues': ['not loading', 'wont load', 'blank', 'white screen', 'stuck'],
    'Permissions': ['no access', 'permission', 'not allowed', 'cant access', 'restricted'],
    'Sync Problems': ['sync', 'not syncing', 'out of sync', 'duplicate'],
    'Confusion': ['confus', 'dont understand', 'not sure', 'unclear', 'what does'],
  };

  const issueCounts = {};

  logs.forEach(log => {
    const message = log.message?.toLowerCase() || '';

    for (const [issueType, keywords] of Object.entries(issueKeywords)) {
      if (keywords.some(kw => message.includes(kw))) {
        if (!issueCounts[issueType]) {
          issueCounts[issueType] = {
            type: issueType,
            count: 0,
            examples: [],
          };
        }
        issueCounts[issueType].count++;

        if (issueCounts[issueType].examples.length < 5) {
          issueCounts[issueType].examples.push({
            message: log.message,
            path: log.currentPath,
            helpful: log.helpful,
            timestamp: log.timestamp,
          });
        }
      }
    }
  });

  return Object.values(issueCounts)
    .sort((a, b) => b.count - a.count);
}

/**
 * Analyze user behavior patterns
 */
function analyzeUserBehavior(logs) {
  const behavior = {
    avgMessagesPerUser: 0,
    returnUsers: 0,
    helpfulnessRate: 0,
    peakHours: {},
    roleDistribution: {},
  };

  // Group by user
  const userSessions = {};
  logs.forEach(log => {
    const userId = log.userId || 'anonymous';
    if (!userSessions[userId]) {
      userSessions[userId] = [];
    }
    userSessions[userId].push(log);
  });

  // Calculate average messages per user
  behavior.avgMessagesPerUser = (logs.length / Object.keys(userSessions).length).toFixed(2);

  // Count return users (more than 1 session)
  behavior.returnUsers = Object.values(userSessions).filter(sessions => sessions.length > 1).length;

  // Calculate helpfulness rate
  const withFeedback = logs.filter(log => log.helpful !== undefined);
  const helpful = logs.filter(log => log.helpful === true);
  behavior.helpfulnessRate = withFeedback.length > 0
    ? ((helpful.length / withFeedback.length) * 100).toFixed(2)
    : 0;

  // Identify peak hours
  logs.forEach(log => {
    if (log.timestamp) {
      const hour = new Date(log.timestamp).getHours();
      behavior.peakHours[hour] = (behavior.peakHours[hour] || 0) + 1;
    }
  });

  // Role distribution
  logs.forEach(log => {
    if (log.userRole) {
      behavior.roleDistribution[log.userRole] = (behavior.roleDistribution[log.userRole] || 0) + 1;
    }
  });

  return behavior;
}

/**
 * Identify gaps in knowledge base
 */
function identifyKnowledgeGaps(logs) {
  const gaps = [];

  // Find questions that got unhelpful ratings
  const unhelpfulLogs = logs.filter(log => log.helpful === false);

  // Group similar questions
  const questionGroups = {};
  unhelpfulLogs.forEach(log => {
    const normalized = normalizeQuestion(log.message);
    if (!questionGroups[normalized]) {
      questionGroups[normalized] = {
        question: log.message,
        count: 0,
        contexts: new Set(),
      };
    }
    questionGroups[normalized].count++;
    if (log.currentPath) {
      questionGroups[normalized].contexts.add(log.currentPath);
    }
  });

  // Identify significant gaps (multiple unhelpful responses)
  Object.values(questionGroups).forEach(group => {
    if (group.count >= 2) {
      gaps.push({
        question: group.question,
        occurrences: group.count,
        contexts: Array.from(group.contexts),
        severity: group.count >= 5 ? 'high' : group.count >= 3 ? 'medium' : 'low',
      });
    }
  });

  return gaps.sort((a, b) => b.occurrences - a.occurrences);
}

/**
 * Generate recommendations based on patterns
 */
function generateRecommendations(patterns) {
  const recommendations = [];

  // Recommend new help articles for common questions
  if (patterns.commonQuestions?.length > 0) {
    patterns.commonQuestions.slice(0, 5).forEach(q => {
      if (parseFloat(q.percentage) > 5) {
        recommendations.push({
          type: 'help_article',
          priority: 'high',
          title: `Create help article: "${q.question}"`,
          reason: `This question represents ${q.percentage}% of all inquiries (${q.count} times)`,
          action: 'Create a detailed help article addressing this common question',
        });
      }
    });
  }

  // Recommend improvements for unhelpful responses
  if (patterns.unhelpfulResponses?.length > 0) {
    patterns.unhelpfulResponses.slice(0, 3).forEach(r => {
      recommendations.push({
        type: 'response_improvement',
        priority: 'high',
        title: `Improve response for: "${r.question}"`,
        reason: `This response was marked unhelpful ${r.count} times`,
        currentResponse: r.response?.substring(0, 100) + '...',
        action: 'Review and improve the response template or add to knowledge base',
      });
    });
  }

  // Recommend UI/UX improvements for frequent confusion areas
  if (patterns.topIssues?.length > 0) {
    patterns.topIssues.forEach(issue => {
      if (issue.count >= 5) {
        recommendations.push({
          type: 'system_improvement',
          priority: issue.count >= 10 ? 'high' : 'medium',
          title: `Address "${issue.type}" issues`,
          reason: `Users reported ${issue.count} issues in this category`,
          examples: issue.examples?.slice(0, 3),
          action: 'Investigate and fix underlying system issues or improve UI clarity',
        });
      }
    });
  }

  // Recommend training for pages with high help requests
  if (patterns.frequentPaths?.length > 0) {
    patterns.frequentPaths.slice(0, 5).forEach(p => {
      if (parseFloat(p.percentage) > 10) {
        recommendations.push({
          type: 'training_material',
          priority: 'medium',
          title: `Create training for ${p.path}`,
          reason: `${p.percentage}% of help requests come from this page`,
          action: 'Create video tutorial or interactive guide for this feature',
        });
      }
    });
  }

  // Recommend knowledge base additions for gaps
  if (patterns.knowledgeGaps?.length > 0) {
    patterns.knowledgeGaps.slice(0, 5).forEach(gap => {
      recommendations.push({
        type: 'knowledge_gap',
        priority: gap.severity,
        title: `Fill knowledge gap: "${gap.question}"`,
        reason: `Users asked this ${gap.occurrences} times and found responses unhelpful`,
        contexts: gap.contexts,
        action: 'Add comprehensive documentation to knowledge base',
      });
    });
  }

  return recommendations;
}

/**
 * Store analyzed patterns in DynamoDB
 */
async function storePatterns(analysis) {
  try {
    const params = {
      TableName: LEARNING_PATTERNS_TABLE,
      Item: {
        id: `analysis-${Date.now()}`,
        timestamp: analysis.timestamp,
        totalInteractions: analysis.totalInteractions,
        patterns: analysis.patterns,
        recommendations: analysis.recommendations,
        ttl: Math.floor(Date.now() / 1000) + (90 * 24 * 60 * 60), // 90 days
      },
    };

    await docClient.send(new PutCommand(params));
    console.log('Patterns stored successfully');
  } catch (error) {
    console.error('Error storing patterns:', error);
  }
}

/**
 * Get the latest learning patterns
 */
async function getLatestPatterns() {
  try {
    const params = {
      TableName: LEARNING_PATTERNS_TABLE,
      Limit: 1,
      ScanIndexForward: false, // Descending order
    };

    const result = await docClient.send(new ScanCommand(params));
    return result.Items?.[0] || null;
  } catch (error) {
    console.error('Error getting latest patterns:', error);
    return null;
  }
}

/**
 * Enhance response generation with learned patterns
 */
function enhanceResponseWithLearning(message, baseResponse, patterns) {
  if (!patterns) return baseResponse;

  const normalized = normalizeQuestion(message);

  // Check if this is a commonly asked question with a better answer
  const commonQ = patterns.patterns?.commonQuestions?.find(q =>
    normalizeQuestion(q.question) === normalized
  );

  if (commonQ && parseFloat(commonQ.percentage) > 5) {
    // Add a note that this is a frequently asked question
    baseResponse.metadata = {
      ...baseResponse.metadata,
      commonQuestion: true,
      frequency: commonQ.percentage,
    };
  }

  // Check if there's a known knowledge gap
  const gap = patterns.patterns?.knowledgeGaps?.find(g =>
    normalizeQuestion(g.question) === normalized
  );

  if (gap) {
    // Add disclaimer and offer to escalate
    baseResponse.text += '\n\n_Note: This is a commonly asked question that we\'re working to improve documentation for. If this answer isn\'t helpful, please mark it as unhelpful and we\'ll prioritize improving it._';
    baseResponse.suggestions = [
      ...baseResponse.suggestions || [],
      'Contact support for more help',
    ];
  }

  return baseResponse;
}

module.exports = {
  analyzeChatPatterns,
  getLatestPatterns,
  enhanceResponseWithLearning,
  identifyCommonQuestions,
  identifyUnhelpfulResponses,
  identifyTopIssues,
  identifyKnowledgeGaps,
  generateRecommendations,
};
