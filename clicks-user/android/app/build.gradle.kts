import java.util.Properties

plugins {
    id("com.android.application")
    id("kotlin-android")
    // The Flutter Gradle Plugin must be applied after the Android and Kotlin Gradle plugins.
    id("dev.flutter.flutter-gradle-plugin")
    // Triple-T Gradle Play Publisher — uploads AABs directly to Google Play
    id("com.github.triplet.play") version "3.10.1"
}

// Apply Google Services only when google-services.json is present (graceful degrade).
if (file("google-services.json").exists()) {
    apply(plugin = "com.google.gms.google-services")
}

// Read Google Maps API key from local.properties
val localPropertiesFile = rootProject.file("local.properties")
val localProperties = Properties()
if (localPropertiesFile.exists()) {
    localPropertiesFile.reader(Charsets.UTF_8).use { localProperties.load(it) }
}
val mapsApiKey: String = localProperties.getProperty("GOOGLE_MAPS_API_KEY", "")

// Read signing config from key.properties
val keyPropertiesFile = rootProject.file("key.properties")
val keyProperties = Properties()
if (keyPropertiesFile.exists()) {
    keyPropertiesFile.reader(Charsets.UTF_8).use { keyProperties.load(it) }
}

android {
    namespace = "com.roya.clicks_user"
    compileSdk = flutter.compileSdkVersion
    ndkVersion = flutter.ndkVersion

    compileOptions {
        isCoreLibraryDesugaringEnabled = true
        sourceCompatibility = JavaVersion.VERSION_11
        targetCompatibility = JavaVersion.VERSION_11
    }

    kotlin {
        compilerOptions {
            jvmTarget = org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_11
        }
    }

    signingConfigs {
        if (keyPropertiesFile.exists()) {
            create("release") {
                keyAlias = keyProperties["keyAlias"] as String
                keyPassword = keyProperties["keyPassword"] as String
                storeFile = file(keyProperties["storeFile"] as String)
                storePassword = keyProperties["storePassword"] as String
            }
        }
    }

    defaultConfig {
        applicationId = "com.roya.clicks_user"
        minSdk = flutter.minSdkVersion
        targetSdk = flutter.targetSdkVersion
        versionCode = flutter.versionCode
        versionName = flutter.versionName

        manifestPlaceholders["GOOGLE_MAPS_API_KEY"] = mapsApiKey
    }

    buildTypes {
        release {
            // Use release keystore when present; otherwise debug for sideload testing.
            signingConfig = if (keyPropertiesFile.exists()) {
                signingConfigs.getByName("release")
            } else {
                signingConfigs.getByName("debug")
            }
        }
    }
}

flutter {
    source = "../.."
}

play {
    serviceAccountCredentials.set(file("../../play-service-account.json"))
    track.set("alpha") // change to "alpha", "beta", or "production" when ready
    defaultToAppBundles.set(true)
}

dependencies {
    coreLibraryDesugaring("com.android.tools:desugar_jdk_libs:2.1.4")
}

// shared_preferences_android pulls androidx.datastore 1.1.7, whose
// libdatastore_shared_counter.so fails Google Play's 16 KB page-size check.
// Force 1.2.1+ which ships a rebuilt native lib (see androidx/datastore 1.2.1).
configurations.configureEach {
    resolutionStrategy.eachDependency {
        if (requested.group == "androidx.datastore") {
            useVersion("1.2.1")
            because("Fix 16KB page-size alignment for libdatastore_shared_counter.so")
        }
    }
}
