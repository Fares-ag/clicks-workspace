# Pages Organization

The pages have been reorganized into feature-based folders for better maintainability and scalability.

## Folder Structure

```
pages/
├── Dashboard/              # Main dashboard view
│   ├── Dashboard.jsx
│   └── index.js
│
├── AdminManagement/        # Admin user management
│   ├── AdminManagement.jsx
│   └── index.js
│
├── TechnicianManagement/   # Technician management pages
│   ├── Technicians.jsx
│   ├── Technicians.css
│   ├── TechnicianDetails.jsx
│   ├── TechnicianDetails.css
│   └── index.js
│
├── VehicleManagement/      # All vehicle-related pages
│   ├── Vehicles.jsx
│   ├── VehicleMakes.jsx
│   ├── VehicleModels.jsx
│   ├── VehicleInsurance.jsx
│   └── index.js
│
├── JobManagement/          # Job management
│   ├── Jobs.jsx
│   └── index.js
│
├── ClientManagement/       # Client management
│   ├── ClientManagement.jsx
│   └── index.js
│
├── Performance/            # Performance analytics
│   ├── Performance.jsx
│   └── index.js
│
├── Calls/                  # Call management
│   ├── Calls.jsx
│   └── index.js
│
├── LiveMap/                # Live tracking map
│   ├── LiveMap.jsx
│   └── index.js
│
├── SourceConfigurator/     # Source configuration
│   ├── Sources.jsx
│   └── index.js
│
├── Login.jsx               # Auth pages (not in subfolder)
├── Login.css
└── DemoPage.jsx            # Standalone pages
```

## Import Patterns

### Single Page Modules
```javascript
import Dashboard from "./pages/Dashboard";
import AdminManagement from "./pages/AdminManagement";
```

### Multiple Page Modules
```javascript
import { Technicians, TechnicianDetails } from "./pages/TechnicianManagement";
import { Vehicles, VehicleMakes, VehicleModels, VehicleInsurance } from "./pages/VehicleManagement";
```

## Benefits

1. **Feature Grouping**: Related pages are grouped together
2. **Scalability**: Easy to add new pages within each feature
3. **Cleaner Imports**: Using index.js for simplified imports
4. **Better Navigation**: Clear folder structure reflects app features
5. **Co-location**: Related CSS files stay with their components

## Adding New Pages

### To add a single page to a feature:

1. Create the file in the appropriate folder:
   ```
   pages/Dashboard/DashboardAnalytics.jsx
   ```

2. Export it in the index.js:
   ```javascript
   export { default as DashboardAnalytics } from './DashboardAnalytics.jsx';
   ```

3. Import in App.jsx:
   ```javascript
   import { DashboardAnalytics } from "./pages/Dashboard";
   ```

### To add a new feature:

1. Create a new folder:
   ```
   pages/NewFeature/
   ```

2. Add your component(s):
   ```
   pages/NewFeature/NewFeature.jsx
   ```

3. Create index.js:
   ```javascript
   export { default } from './NewFeature.jsx';
   ```

4. Import in App.jsx:
   ```javascript
   import NewFeature from "./pages/NewFeature";
   ```
