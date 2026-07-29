const Source = require("../../../clicks-shared/models/Source");

// GET /api/sources
async function getSources(req, res) {
  try {
    const sources = await Source.find({ isActive: true });
    res.json({ sources });
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch sources", error: err.message });
  }
}

// POST /api/sources
async function createSource(req, res) {
  try {
    const { mainSourceName, subSources } = req.body;
    if (!mainSourceName) {
      return res.status(400).json({ message: "Main source name is required" });
    }
    const source = await Source.create({ 
      mainSourceName, 
      subSources: subSources || [],
      isActive: true 
    });
    res.status(201).json({ source });
  } catch (err) {
    res.status(500).json({ message: "Failed to create source", error: err.message });
  }
}

// GET /api/sources/:id
async function getSourceById(req, res) {
  try {
    const source = await Source.findById(req.params.id);
    if (!source) return res.status(404).json({ message: "Source not found" });
    res.json({ source });
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch source", error: err.message });
  }
}

// PUT /api/sources/:id
async function updateSource(req, res) {
  try {
    const { mainSourceName, subSources } = req.body;
    const update = {};
    if (mainSourceName) update.mainSourceName = mainSourceName;
    if (subSources !== undefined) update.subSources = subSources;
    
    const source = await Source.findByIdAndUpdate(req.params.id, update, { new: true });
    if (!source) return res.status(404).json({ message: "Source not found" });
    res.json({ source });
  } catch (err) {
    res.status(500).json({ message: "Failed to update source", error: err.message });
  }
}

// DELETE /api/sources/:id
async function deleteSource(req, res) {
  try {
    const source = await Source.findByIdAndUpdate(
      req.params.id, 
      { isActive: false }, 
      { new: true }
    );
    if (!source) return res.status(404).json({ message: "Source not found" });
    res.json({ message: "Source deleted" });
  } catch (err) {
    res.status(500).json({ message: "Failed to delete source", error: err.message });
  }
}

// DELETE /api/sources/:id/subsources/:subSourceId
async function deleteSubSource(req, res) {
  try {
    const { id, subSourceId } = req.params;
    const source = await Source.findById(id);
    if (!source) return res.status(404).json({ message: "Source not found" });
    
    source.subSources = source.subSources.filter(
      sub => sub._id.toString() !== subSourceId
    );
    await source.save();
    
    res.json({ message: "Sub-source deleted", source });
  } catch (err) {
    res.status(500).json({ message: "Failed to delete sub-source", error: err.message });
  }
}

module.exports = {
  getSources,
  createSource,
  getSourceById,
  updateSource,
  deleteSource,
  deleteSubSource
};
