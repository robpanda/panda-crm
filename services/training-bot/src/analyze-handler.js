/**
 * Lambda handler for periodic analysis of chat patterns
 * Trigger this via CloudWatch Events (e.g., daily at 2 AM)
 */

const { analyzeChatPatterns } = require('./learning-engine');

exports.handler = async (event) => {
  console.log('Starting chat pattern analysis...');

  try {
    const analysis = await analyzeChatPatterns();

    console.log('Analysis completed:', JSON.stringify({
      totalInteractions: analysis.totalInteractions,
      recommendationsCount: analysis.recommendations.length,
      topIssuesCount: analysis.patterns.topIssues.length,
      knowledgeGapsCount: analysis.patterns.knowledgeGaps.length,
    }, null, 2));

    // Send notification if there are high-priority recommendations
    const highPriority = analysis.recommendations.filter(r => r.priority === 'high');
    if (highPriority.length > 0) {
      console.log(`⚠️ ${highPriority.length} high-priority recommendations found`);
      // Could send SNS notification here
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        analysis: {
          timestamp: analysis.timestamp,
          totalInteractions: analysis.totalInteractions,
          recommendationsCount: analysis.recommendations.length,
          highPriorityCount: highPriority.length,
        },
      }),
    };
  } catch (error) {
    console.error('Analysis failed:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        success: false,
        error: error.message,
      }),
    };
  }
};
