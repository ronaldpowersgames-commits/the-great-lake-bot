/**
 * The Great Lake Bot - Group Controller
 * POST /groups - Rules 23-26
 * POST /groups/:groupId/messages - Rules 23-26
 * GET  /groups/:groupId/messages - Rules 23-26
 */
const { v4: uuidv4 } = require('uuid');
const store = require('../store/memoryStore');
const { validateGroup, validateGroupMessage } = require('../validators');

async function createGroup(req, res) {
  const validation = validateGroup(req.body);
  if (!validation.valid) {
    return res.status(400).json({ error: 'Validation failed', details: validation.errors.join(' ') });
  }

  const { groupName, members } = req.body;
  const groupId = uuidv4();
  const memberList = members ? [req.user.id].concat(members) : [req.user.id];
  const uniqueMembers = Array.from(new Set(memberList));

  const group = store.createGroup(groupId, {
    groupName: groupName, members: uniqueMembers,
    createdBy: req.user.id, createdAt: new Date().toISOString(),
  });

  return res.status(200).json({ id: group.id, groupName: group.groupName, members: group.members, createdAt: group.createdAt });
}

async function postMessage(req, res) {
  const groupId = req.params.groupId;
  const validation = validateGroupMessage(req.body);
  if (!validation.valid) {
    return res.status(400).json({ error: 'Validation failed', details: validation.errors.join(' ') });
  }

  const group = store.getGroup(groupId);
  if (!group) {
    return res.status(404).json({ error: 'Group not found', details: 'The Great Lake Bot has no group with ID "' + groupId + '".' });
  }
  if (group.members.indexOf(req.user.id) === -1) {
    return res.status(403).json({ error: 'Access denied', details: 'You are not a member of this group (Rule 24).' });
  }

  const messageRecord = {
    id: uuidv4(), groupId: groupId, userId: req.user.id,
    message: req.body.message, nicknameReferences: req.body.nicknameReferences || [],
    timestamp: new Date().toISOString(),
  };
  store.addGroupMessage(groupId, messageRecord);

  return res.status(200).json({ message: 'Message posted to The Great Lake Bot group session.', data: messageRecord });
}

async function getMessages(req, res) {
  const groupId = req.params.groupId;
  const group = store.getGroup(groupId);
  if (!group) {
    return res.status(404).json({ error: 'Group not found', details: 'The Great Lake Bot has no group with ID "' + groupId + '".' });
  }
  if (group.members.indexOf(req.user.id) === -1) {
    return res.status(403).json({ error: 'Access denied', details: 'You are not a member of this group (Rule 24).' });
  }

  const messages = store.getGroupMessages(groupId) || [];
  return res.status(200).json({ groupId: groupId, groupName: group.groupName, count: messages.length, messages: messages });
}

module.exports = { createGroup: createGroup, postMessage: postMessage, getMessages: getMessages };
