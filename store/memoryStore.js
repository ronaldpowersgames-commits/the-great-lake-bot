/**
 * The Great Lake Bot - In-Memory Data Store
 * Replace with PostgreSQL/MongoDB for production.
 * Provides per-user data isolation (Governance Rule 24: Data Separation).
 */
class MemoryStore {
  constructor() {
    this.users = new Map();
    this.characters = new Map();
    this.groups = new Map();
    this.groupMessages = new Map();
    this.templates = new Map();
    this.engineResults = new Map();
    this.updates = [];
  }

  createUser(userId, data) {
    const user = { id: userId, email: data.email || null, profile: data };
    this.users.set(userId, user);
    return user;
  }

  getUser(userId) {
    return this.users.get(userId) || null;
  }

  setCharacter(userId, characterId, data) {
    const key = userId + ':' + characterId;
    const character = { id: characterId, ...data };
    this.characters.set(key, character);
    return character;
  }

  getCharactersByUser(userId) {
    const results = [];
    for (const [key, value] of this.characters.entries()) {
      if (key.startsWith(userId + ':')) {
        results.push(value);
      }
    }
    return results;
  }

  createGroup(groupId, data) {
    const group = { id: groupId, ...data };
    this.groups.set(groupId, group);
    this.groupMessages.set(groupId, []);
    return group;
  }

  getGroup(groupId) {
    return this.groups.get(groupId) || null;
  }

  addGroupMessage(groupId, message) {
    const messages = this.groupMessages.get(groupId);
    if (!messages) return null;
    messages.push(message);
    return message;
  }

  getGroupMessages(groupId) {
    return this.groupMessages.get(groupId) || null;
  }

  setTemplate(templateId, data) {
    const template = { id: templateId, ...data, createdAt: new Date().toISOString() };
    this.templates.set(templateId, template);
    return template;
  }

  getTemplate(templateId) {
    return this.templates.get(templateId) || null;
  }

  setEngineResult(templateId, result) {
    this.engineResults.set(templateId, result);
    return result;
  }

  addUpdate(update) {
    this.updates.push(update);
    return update;
  }
}

module.exports = new MemoryStore();
