const Admin = require("../models/Admin");
const { uploadBufferToAzure } = require("../utils/azureStorage");

// POST /api/admins/:id/upload-profile
async function uploadProfilePicture(req, res) {
  try {
    const adminId = req.params.id;
    if (!req.file) return res.status(400).json({ message: "No file uploaded" });

    const ext = req.file.originalname.split(".").pop();
    const blobName = `admin-profile/${adminId}_${Date.now()}.${ext}`;
    const url = await uploadBufferToAzure(req.file.buffer, blobName, req.file.mimetype);

    const admin = await Admin.findByIdAndUpdate(
      adminId,
      { profilePicture: url },
      { new: true }
    );
    if (!admin) return res.status(404).json({ message: "Admin not found" });

    res.json({ profilePicture: url });
  } catch (err) {
    res.status(500).json({ message: "Upload failed", error: err.message });
  }
}

const { hashPassword } = require("../utils/authUtils");

// GET /api/admins
async function getAdmins(req, res) {
  try {
    const { page = 1, limit = 10, search = "", role, status } = req.query;
    
    // Build search query
    let query = {};
    
    if (search) {
      query.$or = [
        { firstName: { $regex: search, $options: "i" } },
        { lastName: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } }
      ];
    }
    
    // Add role filter
    if (role) {
      query.role = role;
    }
    
    // Add status filter (convert string to boolean)
    if (status !== undefined) {
      query.isActive = status === "true" || status === true;
    }
    
    const admins = await Admin.find(query)
      .skip((page - 1) * limit)
      .limit(Number(limit));
    const total = await Admin.countDocuments(query);
    res.json({ admins, total });
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch admins", error: err.message });
  }
}

// POST /api/admins
async function createAdmin(req, res) {
  try {
    const { firstName, lastName, role, email, phone, password } = req.body;
    
    // Debug: Log what we received
    console.log('Request body:', req.body);
    console.log('Request file:', req.file);
    
    // Check for missing required fields
    const requiredFields = ['firstName', 'lastName', 'role', 'email', 'phone', 'password'];
    const missingFields = [];
    
    requiredFields.forEach(field => {
      if (!req.body[field] || req.body[field].trim() === '') {
        missingFields.push(field);
      }
    });
    
    if (missingFields.length > 0) {
      return res.status(400).json({ 
        message: `Missing required fields: ${missingFields.join(', ')}`,
        missingFields: missingFields,
        receivedFields: Object.keys(req.body)
      });
    }

    // Check if email already exists
    const exists = await Admin.findOne({ email });
    if (exists) return res.status(409).json({ message: "Email already exists" });
    
    const hashedPassword = hashPassword(password);
    
    // Create admin data
    const adminData = {
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      role: role.trim(),
      email: email.trim().toLowerCase(),
      phone: phone.trim(),
      password: hashedPassword
    };

    // Handle profile image if uploaded
    if (req.file) {
      try {
        const ext = req.file.originalname.split(".").pop();
        const blobName = `admin-profile/${Date.now()}_${firstName}_${lastName}.${ext}`;
        const profileImageUrl = await uploadBufferToAzure(req.file.buffer, blobName, req.file.mimetype);
        adminData.profilePicture = profileImageUrl;
      } catch (uploadError) {
        console.error('Profile image upload failed:', uploadError);
        // Continue without profile image - it's optional
      }
    }

    const admin = await Admin.create(adminData);
    
    // Remove password from response
    const adminResponse = admin.toObject();
    delete adminResponse.password;
    
    res.status(201).json({ admin: adminResponse });
  } catch (err) {
    console.error('Create admin error:', err);
    res.status(500).json({ message: "Failed to create admin", error: err.message });
  }
}

// GET /api/admins/:id
async function getAdminById(req, res) {
  try {
    const admin = await Admin.findById(req.params.id);
    if (!admin) return res.status(404).json({ message: "Admin not found" });
    res.json({ admin });
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch admin", error: err.message });
  }
}

// PUT /api/admins/:id
async function updateAdmin(req, res) {
  try {
    const update = { ...req.body };
    if (update.password) {
      update.password = hashPassword(update.password);
    }
    const admin = await Admin.findByIdAndUpdate(req.params.id, update, { new: true });
    if (!admin) return res.status(404).json({ message: "Admin not found" });
    res.json({ admin });
  } catch (err) {
    res.status(500).json({ message: "Failed to update admin", error: err.message });
  }
}

// DELETE /api/admins/:id
async function deleteAdmin(req, res) {
  try {
    const admin = await Admin.findByIdAndDelete(req.params.id);
    if (!admin) return res.status(404).json({ message: "Admin not found" });
    res.json({ message: "Admin deleted" });
  } catch (err) {
    res.status(500).json({ message: "Failed to delete admin", error: err.message });
  }
}

// PUT /api/admins/:id/status
async function toggleAdminStatus(req, res) {
  try {
    const { isActive } = req.body;
    if (typeof isActive !== 'boolean') {
      return res.status(400).json({ message: "isActive must be a boolean value" });
    }

    const admin = await Admin.findByIdAndUpdate(
      req.params.id,
      { isActive },
      { new: true }
    );
    
    if (!admin) return res.status(404).json({ message: "Admin not found" });
    
    res.json({ 
      message: `Admin ${isActive ? 'activated' : 'deactivated'} successfully`,
      admin 
    });
  } catch (err) {
    res.status(500).json({ message: "Failed to toggle admin status", error: err.message });
  }
}

module.exports = {
  uploadProfilePicture,
  getAdmins,
  createAdmin,
  getAdminById,
  updateAdmin,
  deleteAdmin,
  toggleAdminStatus
};
