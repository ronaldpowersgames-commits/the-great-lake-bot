// routes/crew.js
// 🌊 The Great Lake Bot — Crew Routes
// RESTful endpoints for managing recurring characters (crew members)

const express = require('express');
const router = express.Router();
const Crew = require('../core/model/crew');

// GET all crew members
router.get('/', (req, res) => {
  const allCrew = Crew.getAll();
  res.json(allCrew);
});

// GET a specific crew member by ID
router.get('/:id', (req, res) => {
  const member = Crew.getById(req.params.id);
  if (!member) {
    return res.status(404).json({ error: 'Crew member not found' });
  }
  res.json(member);
});

// POST add a new crew member
router.post('/', (req, res) => {
  const { id, name, nickname, role } = req.body;
  if (!id || !name) {
    return res.status(400).json({ error: 'Missing required fields: id, name' });
  }
  const newMember = Crew.add({
    id,
    name,
    nickname: nickname || '',
    role: role || '',
    status: 'active'
  });
  res.status(201).json(newMember);
});

// PUT update a crew member (e.g., nickname or role)
router.put('/:id', (req, res) => {
  const updated = Crew.update(req.params.id, req.body);
  if (!updated) {
    return res.status(404).json({ error: 'Crew member not found' });
  }
  res.json(updated);
});

// DELETE mark a crew member as inactive
router.delete('/:id', (req, res) => {
  const removed = Crew.remove(req.params.id);
  if (!removed) {
    return res.status(404).json({ error: 'Crew member not found' });
  }
  res.json({ message: 'Crew member removed', removed });
});

module.exports = router;
