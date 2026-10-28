plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.unicornclock.app"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.unicornclock.app"
        // Fire OS 6 (Android 7.1) and up: every Fire tablet that can run the clock's games
        minSdk = 25
        targetSdk = 34
        // CI sets these from the run number, so every build installs over the last one
        versionCode = (System.getenv("UC_VERSION_CODE") ?: "1").toInt()
        versionName = System.getenv("UC_VERSION_NAME") ?: "1.0"
    }

    signingConfigs {
        create("release") {
            // A fixed key, so each new build updates the installed app and keeps its data.
            // CI signs with the private key (keystore/release.jks.enc, unlocked by the UNICORN_KEY_PASS secret)
            // when that secret is set; otherwise with the public test key in keystore/unicornclock.jks.
            val privateStore = System.getenv("UC_KEYSTORE")
            if (privateStore != null) {
                storeFile = file(privateStore)
                storeType = "pkcs12"
                storePassword = System.getenv("UC_KEY_PASS")
                keyAlias = "unicornclock"
                keyPassword = System.getenv("UC_KEY_PASS")
            } else {
                storeFile = file("../keystore/unicornclock.jks")
                storePassword = "unicorn-clock"
                keyAlias = "unicornclock"
                keyPassword = "unicorn-clock"
            }
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
