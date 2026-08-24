# 🚀 Clicks User

A powerful, modular, and scalable Flutter starter project to accelerate your development with a modern, maintainable structure—ideal for both solo developers and team environments.

# 📣 About Clicks User

Clicks User is crafted to help Flutter developers build professional, robust apps with ease. The modular architecture ensures clear separation of concerns and effortless project expansion.

## 📁 Project Structure

This template enforces clarity and best practices with a feature-first organization. Here’s a breakdown:

This template separates core functionality and features into clear modules for easy expansion and code clarity.

<pre>
lib/
├── core/ # Shared logic and utilities
│ ├── api/ # API services & network config
│ ├── components/ # Shared, reusable UI widgets
│ ├── di.dart # Dependency injection setup
│ ├── helpers/ # Utilities (AppContext, CacheHelper, AssetsManager, etc.)
│ ├── routing/ # App routing definitions & logic
│ └── themes/ # Light/Dark themes & styles
│
├── features/ # Modular app features
│ └── splash/ # (Example) Feature: Splash screen
│ ├── logic/ # Business/data logic layer
│ │ ├── datasources/ # API/local data handling
│ │ └── models/ # Data models
│ └── ui/ # UI layer for feature
│ ├── cubit/ # State management (Cubit/BLoC)
│ └── view/ # Screens/widgets
│ └── screen.dart
│ └── widgets/
│
└── main.dart # Application entry point
</pre>

## 🛠 Features

- Modular, feature-based architecture
- Centralized dependency injection
- Clean API structure and helpers
- Reusable UI components
- Organized routing and theming
- Scalable state management using Cubit/BLoC

## Production builds

See [BUILD.md](BUILD.md) for release commands, including optional `--dart-define=SENTRY_DSN=...` for crash reporting.
