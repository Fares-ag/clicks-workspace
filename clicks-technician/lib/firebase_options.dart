// Firebase config for clicks-technician-qa (com.clicks.tech).
// API keys are injected at build time — see google-services.json locally or --dart-define.
// iOS: place GoogleService-Info.plist in ios/Runner/ (see ios/Runner/README-FIREBASE.md).
import 'dart:io' show Platform;

import 'package:firebase_core/firebase_core.dart' show Firebase, FirebaseOptions;
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
        return ios;
      default:
        throw UnsupportedError(
          'Firebase is not configured for $defaultTargetPlatform.',
        );
    }
  }

  static FirebaseOptions get android => FirebaseOptions(
    apiKey: const String.fromEnvironment('FIREBASE_ANDROID_API_KEY'),
    appId: '1:326682322843:android:4acb35e71f46d9a557233e',
    messagingSenderId: '326682322843',
    projectId: 'clicks-technician-qa',
    storageBucket: 'clicks-technician-qa.firebasestorage.app',
  );

  /// Optional when not using GoogleService-Info.plist (values from Firebase Console).
  static FirebaseOptions get ios => FirebaseOptions(
    apiKey: const String.fromEnvironment('FIREBASE_IOS_API_KEY'),
    appId: const String.fromEnvironment('FIREBASE_IOS_APP_ID'),
    messagingSenderId: '326682322843',
    projectId: 'clicks-technician-qa',
    storageBucket: 'clicks-technician-qa.firebasestorage.app',
    iosBundleId: 'com.roya.clicksTechnician',
  );
}

/// Initializes Firebase per platform without crashing when iOS plist is present.
class FirebaseBootstrap {
  static Future<void> initialize() async {
    if (kIsWeb) {
      throw UnsupportedError('Firebase is not configured for web.');
    }
    if (!kIsWeb && Platform.isIOS) {
      // Reads ios/Runner/GoogleService-Info.plist from the app bundle when present.
      await Firebase.initializeApp();
      return;
    }
    await Firebase.initializeApp(options: DefaultFirebaseOptions.currentPlatform);
  }
}
