const mongoose = require('mongoose');

const userProfileSchema = new mongoose.Schema({
  userId: { type: String, unique: true },
  streak: { type: Number, default: 0 },
  badges: [{ type: String }],
  topDelayedTags: [{ tag: String, count: Number }],
  lastTaskCompletionDate: Date,
});

const achievementSchema = new mongoose.Schema({
  userId: String,
  type: String, // e.g., 'carried_tasks_cleared', 'delayed_task_cleared'
  count: Number,
  achievedAt: Date,
});

const UserProfile = mongoose.model('UserProfile', userProfileSchema);
const Achievement = mongoose.model('Achievement', achievementSchema);

module.exports = {
  UserProfile,
  Achievement,
};
