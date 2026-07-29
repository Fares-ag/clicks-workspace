import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import SuccessModal from "../../components/SuccessModal.jsx";
import AddSourceModal from "../../components/AddSourceModal.jsx";
import EditSourceModal from "../../components/EditSourceModal.jsx";
import { useGetSourcesQuery, useDeleteSourceMutation, useDeleteSubSourceMutation } from "../../store/sourceApi";
import "./Sources.css";

function Sources() {
  const navigate = useNavigate();
  const { data: sourcesData, isLoading } = useGetSourcesQuery();
  const [deleteSource] = useDeleteSourceMutation();
  const [deleteSubSource] = useDeleteSubSourceMutation();
  
  const [showSuccess, setShowSuccess] = useState(false);
  const [successMessage, setSuccessMessage] = useState("Source updated successfully");
  const [modalOpen, setModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editSourceId, setEditSourceId] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedSources, setExpandedSources] = useState({});

  const sources = sourcesData?.sources || [];

  const handleEdit = (source) => {
    setEditSourceId(source._id);
    setEditModalOpen(true);
  };

  const handleDelete = async (sourceId) => {
    if (!window.confirm("Are you sure you want to delete this source?")) return;
    
    try {
      await deleteSource(sourceId).unwrap();
      setSuccessMessage("Source deleted successfully");
      setShowSuccess(true);
    } catch (error) {
      console.error("Error deleting source:", error);
      alert("Failed to delete source");
    }
  };

  const handleDeleteSubSource = async (mainSourceId, subSourceId) => {
    if (!window.confirm("Are you sure you want to delete this sub-source?")) return;
    
    try {
      await deleteSubSource({ sourceId: mainSourceId, subSourceId }).unwrap();
      setSuccessMessage("Sub-source deleted successfully");
      setShowSuccess(true);
    } catch (error) {
      console.error("Error deleting sub-source:", error);
      alert("Failed to delete sub-source");
    }
  };

  const toggleExpand = (sourceId) => {
    setExpandedSources(prev => ({
      ...prev,
      [sourceId]: !prev[sourceId]
    }));
  };

  const filteredSources = sources.filter(source =>
    source.mainSourceName.toLowerCase().includes(searchQuery.toLowerCase()) ||
    source.subSources?.some(sub => sub.name.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  return (
    <div className="sources-container">
      {/* Header */}
      <div className="sources-header">
        <h1 className="sources-title">Source Configuration</h1>
        <div className="sources-header-actions">
          <div className="sources-search">
            <img src="/icons/Search.svg" alt="Search" className="sources-search-icon" />
            <input 
              type="text" 
              placeholder="Search" 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="sources-search-input"
            />
          </div>
          <button className="sources-add-btn" onClick={() => setModalOpen(true)}>
            <span className="sources-add-icon">+</span>
            Add New Source
          </button>
        </div>
      </div>

      {/* Custom Table */}
      <div className="sources-table">
        {/* Table Header */}
        <div className="sources-table-header">
          <div className="sources-table-header-cell sources-list-column">List</div>
          <div className="sources-table-header-cell sources-action-column">Action</div>
        </div>

        {/* Table Body */}
        <div className="sources-table-body">
          {isLoading ? (
            <div className="sources-loading">Loading sources...</div>
          ) : filteredSources.length === 0 ? (
            <div className="sources-empty">No sources found</div>
          ) : (
            filteredSources.map((source, index) => (
              <React.Fragment key={source._id}>
                {/* Main Source Row */}
                <div className={`sources-table-row ${index === filteredSources.length - 1 ? 'last' : ''}`}>
                  <div className="sources-table-cell sources-list-column">
                    <div className="sources-list-content">
                      <button 
                        className="sources-expand-btn"
                        onClick={() => toggleExpand(source._id)}
                      >
                        <span className="sources-main-name">{source.mainSourceName}</span>
                        <img 
                          src="/icons/arrow-down.svg" 
                          alt="Expand" 
                          className={`sources-expand-icon ${expandedSources[source._id] ? 'expanded' : ''}`}
                        />
                      </button>

                      {/* Expanded Sub-sources */}
                      {expandedSources[source._id] && source.subSources && source.subSources.length > 0 && (
                        <div className="sources-subsources">
                          {source.subSources.map((subSource) => (
                            <div 
                              key={subSource._id} 
                              className="sources-subsource-item"
                            >
                              <span className="sources-subsource-name">{subSource.name}</span>
                              <button 
                                className="sources-subsource-delete"
                                onClick={() => handleDeleteSubSource(source._id, subSource._id)}
                              >
                                <img src="/icons/li-trash.svg" alt="Delete" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="sources-table-cell sources-action-column">
                    <button 
                      className="sources-action-btn sources-delete-btn"
                      onClick={() => handleDelete(source._id)}
                    >
                      <img src="/icons/trash.svg" alt="Delete" />
                    </button>
                    <button 
                      className="sources-action-btn sources-edit-btn"
                      onClick={() => handleEdit(source)}
                    >
                      <img src="/icons/pencil.svg" alt="Edit" />
                    </button>
                  </div>
                </div>
              </React.Fragment>
            ))
          )}
        </div>
      </div>

      <AddSourceModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSuccess={() => {
          setSuccessMessage("Source created successfully");
          setShowSuccess(true);
          setModalOpen(false);
        }}
      />
      <EditSourceModal
        open={editModalOpen}
        onClose={() => setEditModalOpen(false)}
        sourceId={editSourceId}
        onSuccess={() => {
          setSuccessMessage("Source updated successfully");
          setShowSuccess(true);
          setEditModalOpen(false);
        }}
      />
      <SuccessModal
        open={showSuccess}
        onClose={() => setShowSuccess(false)}
        title="Success"
        subtitle={successMessage}
      />
    </div>
  );
}

export default Sources;
