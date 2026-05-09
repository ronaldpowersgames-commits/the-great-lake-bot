const express = require('express');
const router = express.Router();
const Crew = require('../models/crew'); // or wherever your data lives

// Remove crew member
router.delete('/:id', async (req, res) => {
  try {
    await Crew.updateOne({ id: req.params.id }, { status: 'inactive' });
    res.json({ message: 'Crew member removed' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to remove crew member' });
  }
});

// Update nickname
router.put('/:id/nickname', async (req, res) => {
  try {
    await Crew.updateOne(
      { id: req.params.id },
      { nickname: req.body.nickname }
    );
    res.json({ message: 'Nickname updated' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update nickname' });
  }
});

module.exports = router;
