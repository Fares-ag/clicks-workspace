// Firebase config for clicks-technician-qa (com.clicks.tech).
// Generated from android/app/google-services.json — required for FCM in background isolates.
import 'package:firebase_core/firebase_core.dart' show FirebaseOptions;
import 'package:flutter/foundation.dart'
    show defaultTargetPlatform, kIsWeb, TargetPlatform;

class DefaultFirebaseOptions {
  static FirebaseOptions get currentPlatform {
    if (kIsWeb) {
      throw UnsupportedError('Firebase is not configured for web.');
    }
    switch (defaultTargetPlatform) {
      case TargetPlatform.android:
        return android;
      case TargetPlatform.iOS:
        throw UnsupportedError(
          'Add iOS Firebase options before building for iOS.',
        );
      default:
        throw UnsupportedError(
          'Firebase is not configured for $defaultTargetPlatform.',
        );
    }
  }

  static const FirebaseOptions android = FirebaseOptions(
    apiKey: 'AIzaSyD6vTWtV7OzipppbOSKMAIHdbknE0ZQ7Zo',
    appId: '1:326682322843:android:4acb35e71f46d9a557233e',
    messagingSenderId: '326682322843',
    projectId: 'clicks-technician-qa',
    storageBucket: 'clicks-technician-qa.firebasestorage.app',
  );
}
