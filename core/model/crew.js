// core/model/crew.js
// 🌊 The Great Lake Bot — Crew Model
// Lightweight in-memory data model for managing recurring characters (crew members)

let crew = [
  // Example starter data:
  // { id: "lexi", name: "Lexi Thompson", nickname: "Captain Lexi", role: "Creative Director", status: "active" }
];

// Retrieve all crew members
function getAll() {
  return crew;
}

// Retrieve a crew member by ID
function getById(id) {
  return crew.find(c => c.id === id);
}

// Add a new crew member
function add(member) {
  crew.push(member);
  return member;
}

// Update a crew member’s data
function update(id, data) {
  const index = crew.findIndex(c => c.id === id);
  if (index === -1) return null;
  crew[index] = { ...crew[index], ...data };
  return crew[index];
}

// Mark a crew member as inactive (soft delete)
function remove(id) {
  const index = crew.findIndex(c => c.id === id);
  if (index === -1) return null;
  crew[index].status = "inactive";
  return crew[index];
}

// Export model functions
module.exports = {
  getAll,
  getById,
  add,
  update,
  remove
};
