const { useState, useEffect } = React;

function getTodayDateString() {
  const today = new Date();
  return today.toISOString().split('T')[0];
}

function loadTasks() {
  const saved = localStorage.getItem('tasks');
  if (saved) {
    return JSON.parse(saved);
  }
  return [];
}

function saveTasks(tasks) {
  localStorage.setItem('tasks', JSON.stringify(tasks));
}

function App() {
  const [tasks, setTasks] = useState(loadTasks());
  const [newTaskText, setNewTaskText] = useState('');
  const [newTaskDueDate, setNewTaskDueDate] = useState('');
  const [alert, setAlert] = useState(null);

  useEffect(() => {
    const today = getTodayDateString();
    let updated = false;
    const updatedTasks = tasks.map(task => {
      if (!task.completed && task.dueDate && task.dueDate < today && !task.carriedForward) {
        updated = true;
        return {...task, carriedForward: true, dueDate: today};
      }
      return task;
    });
    if (updated) {
      setTasks(updatedTasks);
      saveTasks(updatedTasks);
    }
  }, []);

  useEffect(() => {
    const today = new Date();
    const staleTasks = tasks.filter(task => {
      if (task.completed) return false;
      if (!task.dueDate) return false;
      const due = new Date(task.dueDate);
      const diffDays = Math.floor((today - due) / (1000 * 60 * 60 * 24));
      return diffDays >= 3;
    });
    if (staleTasks.length > 0) {
      setAlert("You have " + staleTasks.length + " stale task(s) incomplete for 3+ days.");
    } else {
      setAlert(null);
    }
  }, [tasks]);

  function addTask() {
    if (!newTaskText.trim()) return;
    const newTask = {
      id: Date.now(),
      text: newTaskText.trim(),
      completed: false,
      dueDate: newTaskDueDate || null,
      carriedForward: false,
      createdAt: getTodayDateString(),
    };
    const updatedTasks = [...tasks, newTask];
    setTasks(updatedTasks);
    saveTasks(updatedTasks);
    setNewTaskText('');
    setNewTaskDueDate('');
  }

  function toggleComplete(id) {
    const updatedTasks = tasks.map(task => {
      if (task.id === id) {
        return {...task, completed: !task.completed};
      }
      return task;
    });
    setTasks(updatedTasks);
    saveTasks(updatedTasks);
  }

  function deleteTask(id) {
    const updatedTasks = tasks.filter(task => task.id !== id);
    setTasks(updatedTasks);
    saveTasks(updatedTasks);
  }

  function editTask(id, newText, newDueDate) {
    const updatedTasks = tasks.map(task => {
      if (task.id === id) {
        return {...task, text: newText, dueDate: newDueDate};
      }
      return task;
    });
    setTasks(updatedTasks);
    saveTasks(updatedTasks);
  }

  return React.createElement('div', null,
    React.createElement('h1', null, 'Smart To-Do List'),
    alert && React.createElement('div', {className: 'alert'}, alert),
    React.createElement('div', {className: 'task-form'},
      React.createElement('input', {
        type: 'text',
        placeholder: 'New task',
        value: newTaskText,
        onChange: e => setNewTaskText(e.target.value)
      }),
      React.createElement('input', {
        type: 'date',
        value: newTaskDueDate,
        onChange: e => setNewTaskDueDate(e.target.value)
      }),
      React.createElement('button', {onClick: addTask}, 'Add')
    ),
    React.createElement('ul', {className: 'task-list'},
      tasks.map(task =>
        React.createElement(TaskItem, {
          key: task.id,
          task: task,
          toggleComplete: toggleComplete,
          deleteTask: deleteTask,
          editTask: editTask
        })
      )
    )
  );
}

function TaskItem({ task, toggleComplete, deleteTask, editTask }) {
  const [isEditing, setIsEditing] = React.useState(false);
  const [editText, setEditText] = React.useState(task.text);
  const [editDueDate, setEditDueDate] = React.useState(task.dueDate || '');

  function saveEdit() {
    if (!editText.trim()) return;
    editTask(task.id, editText.trim(), editDueDate || null);
    setIsEditing(false);
  }

  if (isEditing) {
    return React.createElement('li', {className: 'task-item'},
      React.createElement('input', {
        type: 'text',
        value: editText,
        onChange: e => setEditText(e.target.value)
      }),
      React.createElement('input', {
        type: 'date',
        value: editDueDate,
        onChange: e => setEditDueDate(e.target.value)
      }),
      React.createElement('button', {onClick: saveEdit}, 'Save'),
      React.createElement('button', {onClick: () => setIsEditing(false)}, 'Cancel')
    );
  }

  return React.createElement('li', {className: 'task-item ' + (task.completed ? 'completed' : '')},
    React.createElement('div', null,
      React.createElement('input', {
        type: 'checkbox',
        checked: task.completed,
        onChange: () => toggleComplete(task.id)
      }),
      React.createElement('span', null, task.text),
      task.carriedForward && React.createElement('span', {className: 'task-label'}, 'Carried Forward'),
      task.dueDate && React.createElement('small', null, ' (Due: ' + task.dueDate + ')')
    ),
    React.createElement('div', {className: 'task-actions'},
      React.createElement('button', {onClick: () => setIsEditing(true)}, 'Edit'),
      React.createElement('button', {className: 'delete', onClick: () => deleteTask(task.id)}, 'Delete')
    )
  );
}

ReactDOM.render(React.createElement(App), document.getElementById('root'));
