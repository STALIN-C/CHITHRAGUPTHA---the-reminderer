const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const admin = require('firebase-admin');
const serviceAccount = require('./firebase-service-account.json'); // You need to provide this file

const app = express();
const PORT = process.env.PORT || 5000;

const authenticateFirebaseToken = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const idToken = authHeader.split('Bearer ')[1];
  try {
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    req.user = decodedToken;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
};

// Middleware
app.use(cors());
app.use(express.json());

// Initialize Firebase Admin SDK
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

// MongoDB connection
mongoose.connect('mongodb://localhost:27017/smart-todo', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
}).then(() => {
  console.log('MongoDB connected');
}).catch(err => {
  console.error('MongoDB connection error:', err);
});

// Task schema and model
const taskSchema = new mongoose.Schema({
  userId: String,
  text: String,
  completed: Boolean,
  dueDate: Date,
  carriedForward: Boolean,
  createdAt: Date,
  updatedAt: Date,
  tags: [String],
  escalationStatus: {
    type: String,
    enum: ['none', 'reschedule', 'split', 'archive', 'deprioritize'],
    default: 'none',
  },
  delayCount: {
    type: Number,
    default: 0,
  },
});

const Task = mongoose.model('Task', taskSchema);
const { UserProfile, Achievement } = require('./models');

// Routes

// Get tasks for authenticated user
app.get('/api/tasks', authenticateFirebaseToken, async (req, res) => {
  const userId = req.user.uid;
  try {
    const tasks = await Task.find({ userId });
    res.json(tasks);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Get user profile
app.get('/api/user/profile', authenticateFirebaseToken, async (req, res) => {
  const userId = req.user.uid;
  try {
    let profile = await UserProfile.findOne({ userId });
    if (!profile) {
      profile = new UserProfile({ userId });
      await profile.save();
    }
    res.json(profile);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Get user achievements
app.get('/api/user/achievements', authenticateFirebaseToken, async (req, res) => {
  const userId = req.user.uid;
  try {
    const achievements = await Achievement.find({ userId });
    res.json(achievements);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Update task with escalation and gamification logic
app.put('/api/tasks/:id', authenticateFirebaseToken, async (req, res) => {
  const taskId = req.params.id;
  const updateData = req.body;
  if (updateData.dueDate) {
    updateData.dueDate = new Date(updateData.dueDate);
  }
  updateData.updatedAt = new Date();

  try {
    const task = await Task.findById(taskId);
    if (!task) return res.status(404).json({ error: 'Task not found' });

    // Update task fields
    Object.assign(task, updateData);

    // Escalation logic
    const today = new Date();
    if (!task.completed && task.dueDate) {
      const due = new Date(task.dueDate);
      const diffDays = Math.floor((today - due) / (1000 * 60 * 60 * 24));

      if (diffDays >= 7) {
        task.escalationStatus = 'archive';
      } else if (diffDays >= 5) {
        task.escalationStatus = 'reschedule';
      } else if (diffDays >= 3) {
        task.escalationStatus = 'none'; // basic stale alert handled on frontend
      } else {
        task.escalationStatus = 'none';
      }

      task.delayCount = diffDays > 0 ? diffDays : 0;
    } else {
      task.escalationStatus = 'none';
      task.delayCount = 0;
    }

    await task.save();

    // Update pattern detection and gamification
    // Update UserProfile topDelayedTags
    const userId = req.user.uid;
    const delayedTasks = await Task.find({ userId, delayCount: { $gte: 3 } });
    const tagCounts = {};
    delayedTasks.forEach(t => {
      t.tags.forEach(tag => {
        tagCounts[tag] = (tagCounts[tag] || 0) + 1;
      });
    });
    const topDelayedTags = Object.entries(tagCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([tag, count]) => ({ tag, count }));

    let profile = await UserProfile.findOne({ userId });
    if (!profile) {
      profile = new UserProfile({ userId });
    }
    profile.topDelayedTags = topDelayedTags;

    // Update streaks and badges (simplified example)
    if (task.completed) {
      const lastDate = profile.lastTaskCompletionDate || new Date(0);
      const todayDate = new Date();
      const diffTime = todayDate - lastDate;
      const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
      if (diffDays === 1) {
        profile.streak = (profile.streak || 0) + 1;
      } else if (diffDays > 1) {
        profile.streak = 1;
      }
      profile.lastTaskCompletionDate = todayDate;

      // Example badge awarding
      if (task.carriedForward) {
        const badge = 'Cleared carried-forward task';
        if (!profile.badges.includes(badge)) {
          profile.badges.push(badge);
        }
      }
      if (task.delayCount >= 7) {
        const badge = 'Cleared task delayed 7+ days';
        if (!profile.badges.includes(badge)) {
          profile.badges.push(badge);
        }
      }
    }

    await profile.save();

    res.json(task);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Create a new task
app.post('/api/tasks', authenticateFirebaseToken, async (req, res) => {
  const { text, completed, dueDate, carriedForward, tags } = req.body;
  const userId = req.user.uid;
  if (!text) return res.status(400).json({ error: 'Missing required fields' });
  try {
    const task = new Task({
      userId,
      text,
      completed: completed || false,
      dueDate: dueDate ? new Date(dueDate) : null,
      carriedForward: carriedForward || false,
      createdAt: new Date(),
      updatedAt: new Date(),
      tags: tags || [],
    });
    await task.save();
    res.status(201).json(task);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Update a task
app.put('/api/tasks/:id', authenticateFirebaseToken, async (req, res) => {
  const taskId = req.params.id;
  const updateData = req.body;
  if (updateData.dueDate) {
    updateData.dueDate = new Date(updateData.dueDate);
  }
  updateData.updatedAt = new Date();
  try {
    const task = await Task.findByIdAndUpdate(taskId, updateData, { new: true });
    if (!task) return res.status(404).json({ error: 'Task not found' });
    res.json(task);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Delete a task
app.delete('/api/tasks/:id', authenticateFirebaseToken, async (req, res) => {
  const taskId = req.params.id;
  try {
    const task = await Task.findByIdAndDelete(taskId);
    if (!task) return res.status(404).json({ error: 'Task not found' });
    res.json({ message: 'Task deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
