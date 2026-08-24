// Firebase config for clicks-customer (com.roya.clicks_user / com.roya.clicksUser).
// ignore_for_file: type=lint
import 'package:firebase_core/firebase_core.dart' show FirebaseOptions;
import 'package:flutter/foundation.dart'
    show defaultTargetPlatform, kIsWeb, TargetPlatform;

class DefaultFirebaseOptions {
  static FirebaseOptions get currentPlatform {
    if (kIsWeb) {
      throw UnsupportedError(
        'DefaultFirebaseOptions have not been configured for web.',
      );
    }
    switch (defaultTargetPlatform) {
      case TargetPlatform.android:
        return android;
      case TargetPlatform.iOS:
        return ios;
      case TargetPlatform.macOS:
        throw UnsupportedError(
          'DefaultFirebaseOptions have not been configured for macos.',
        );
      case TargetPlatform.windows:
        throw UnsupportedError(
          'DefaultFirebaseOptions have not been configured for windows.',
        );
      case TargetPlatform.linux:
        throw UnsupportedError(
          'DefaultFirebaseOptions have not been configured for linux.',
        );
      default:
        throw UnsupportedError(
          'DefaultFirebaseOptions are not supported for this platform.',
        );
    }
  }

  static FirebaseOptions get android => FirebaseOptions(
    apiKey: const String.fromEnvironment('FIREBASE_ANDROID_API_KEY'),
    appId: '1:405834083597:android:24b476e22d2a639bcd1444',
    messagingSenderId: '405834083597',
    projectId: 'clicks-customer',
    storageBucket: 'clicks-customer.firebasestorage.app',
  );

  static FirebaseOptions get ios => FirebaseOptions(
    apiKey: const String.fromEnvironment('FIREBASE_IOS_API_KEY'),
    appId: '1:405834083597:ios:71760a0df6eba119cd1444',
    messagingSenderId: '405834083597',
    projectId: 'clicks-customer',
    storageBucket: 'clicks-customer.firebasestorage.app',
    iosBundleId: 'com.roya.clicksUser',
  );
}
