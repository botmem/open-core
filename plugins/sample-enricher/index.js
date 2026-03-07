// Sample Botmem Plugin -- Lifecycle Hook
// This plugin logs entity information after a memory is enriched.
// Copy this directory and modify to create your own plugin.

module.exports = {
  afterEnrich(memory) {
    const entities = memory.entities ? JSON.parse(memory.entities) : [];
    if (entities.length > 0) {
      console.log(
        `[sample-enricher] Memory ${memory.id?.slice(0, 8)} has ${entities.length} entities:`,
        entities.map(e => `${e.type}:${e.value}`).join(', ')
      );
    }
  },
};
