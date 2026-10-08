module.exports = {
  // This official alias follows the latest ChatGPT Instant model.
  chatModel: process.env.OPENAI_MODEL || 'chat-latest',
  summaryModel: process.env.OPENAI_SUMMARY_MODEL || 'gpt-4o-mini'
};
