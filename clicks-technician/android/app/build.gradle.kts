import java.util.Properties

plugins {
    id("com.android.application")
    id("kotlin-android")
    // The Flutter Gradle Plugin must be applied after the Android and Kotlin Gradle plugins.
    id("dev.flutter.flutter-gradle-plugin")
    id("com.github.triplet.play")
}

// Apply Google Services only when google-services.json is present (graceful degrade).
if (file("google-services.json").exists()) {
    apply(plugin = "com.google.gms.google-services")
}

// Read Google Maps API key from local.properties (never commit the key).
val localPropertiesFile = rootProject.file("local.properties")
val localProperties = Properties()
if (localPropertiesFile.exists()) {
    localPropertiesFile.reader(Charsets.UTF_8).use { localProperties.load(it) }
}
val mapsApiKey: String = localProperties.getProperty("GOOGLE_MAPS_API_KEY", "")

// Release signing — android/key.properties + upload keystore (see PLAY_STORE.md).
val keystorePropertiesFile = rootProject.file("key.properties")
val keystoreProperties = Properties()
if (keystorePropertiesFile.exists()) {
    keystorePropertiesFile.reader(Charsets.UTF_8).use { keystoreProperties.load(it) }
}

android {
    namespace = "com.roya.clicks_technician"
    compileSdk = flutter.compileSdkVersion
    ndkVersion = flutter.ndkVersion

    compileOptions {
        isCoreLibraryDesugaringEnabled = true
        sourceCompatibility = JavaVersion.VERSION_11
        targetCompatibility = JavaVersion.VERSION_11
    }

    kotlin {
        compilerOptions {
            jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_11)
        }
    }

    signingConfigs {
        if (keystorePropertiesFile.exists()) {
            create("release") {
                keyAlias = keystoreProperties.getProperty("keyAlias")
                keyPassword = keystoreProperties.getProperty("keyPassword")
                storePassword = keystoreProperties.getProperty("storePassword")
                storeFile = file(keystoreProperties.getProperty("storeFile")!!)
            }
        }
    }

    defaultConfig {
        applicationId = "com.clicks.tech"
        minSdk = maxOf(flutter.minSdkVersion, 23)
        targetSdk = flutter.targetSdkVersion
        versionCode = flutter.versionCode
        versionName = flutter.versionName
        multiDexEnabled = true

        // Injected into AndroidManifest meta-data for Maps SDK
        manifestPlaceholders["GOOGLE_MAPS_API_KEY"] = mapsApiKey
    }

    buildTypes {
        release {
            signingConfig = if (keystorePropertiesFile.exists()) {
                signingConfigs.getByName("release")
            } else {
                // Fallback for local sideload builds without a release keystore.
                signingConfigs.getByName("debug")
            }
        }
    }
}

flutter {
    source = "../.."
}

play {
    val credsFromEnv = System.getenv("PLAY_STORE_JSON")
    val credsFile = when {
        credsFromEnv != null && credsFromEnv.isNotBlank() -> file(credsFromEnv)
        rootProject.file("../play-store/service-account.json").exists() ->
            rootProject.file("../play-store/service-account.json")
        else -> rootProject.file("../play-store/service-account.json")
    }
    serviceAccountCredentials.set(credsFile)
    track.set(System.getenv("PLAY_STORE_TRACK") ?: "internal")
    defaultToAppBundles.set(true)
    // Flutter writes the bundle here after `flutter build appbundle`.
    artifactDir.set(file("../../build/app/outputs/bundle/release"))
}

dependencies {
    coreLibraryDesugaring("com.android.tools:desugar_jdk_libs:2.1.4")
}
