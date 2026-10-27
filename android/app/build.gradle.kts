plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.natebloom.app"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.natebloom.app"
        minSdk = 29
        targetSdk = 35
        // CI sets these from the run number, so every build installs over the last one
        versionCode = (System.getenv("NB_VERSION_CODE") ?: "1").toInt()
        versionName = System.getenv("NB_VERSION_NAME") ?: "1.0"
    }

    signingConfigs {
        create("release") {
            // A fixed key so each new build updates the installed app (and keeps its data).
            storeFile = file("../keystore/natebloom.jks")
            storePassword = "natebloom-tab"
            keyAlias = "natebloom"
            keyPassword = "natebloom-tab"
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            signingConfig = signingConfigs.getByName("release")
        }
        debug {
            signingConfig = signingConfigs.getByName("release")
        }
    }

    buildFeatures {
        buildConfig = true
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }
}

dependencies {
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.activity:activity-ktx:1.9.3")
    implementation("androidx.webkit:webkit:1.12.1")
}
