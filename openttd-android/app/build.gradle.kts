plugins {
    id("com.android.application")
}

android {
    namespace = "com.unicornclock.railways"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.unicornclock.railways"
        // Fire OS 7 (Android 9) and up; built for Fire OS 8 (Android 11)
        minSdk = 24
        targetSdk = 34
        versionCode = (System.getenv("UR_VERSION_CODE") ?: "1").toInt()
        versionName = System.getenv("UR_VERSION_NAME") ?: "0.1"
    }

    signingConfigs {
        create("release") {
            // same public test key as the Unicorn Clock app until the private key is set up for it
            storeFile = file("../../unicorn-android/keystore/unicornclock.jks")
            storePassword = "unicorn-clock"
            keyAlias = "unicornclock"
            keyPassword = "unicorn-clock"
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            signingConfig = signingConfigs.getByName("release")
        }
    }

    lint { checkReleaseBuilds = false }

    // libSDL2.so and libmain.so (OpenTTD) are built by ci/build-native.sh into app/src/main/jniLibs
    packaging { jniLibs { useLegacyPackaging = true } }
    androidResources { noCompress += listOf("tar", "grf", "obg", "obs", "cfg") }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}
