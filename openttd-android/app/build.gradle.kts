plugins {
    id("com.android.application")
}

android {
    namespace = "com.unicornclock.railways"
    compileSdk = 35

    defaultConfig {
        // Fire OS 7 (Android 9) and up; built for Fire OS 8 (Android 11) and the Galaxy Tab S10 FE+ (Android 15)
        minSdk = 24
        targetSdk = 34
        versionCode = (System.getenv("UR_VERSION_CODE") ?: "1").toInt()
        versionName = System.getenv("UR_VERSION_NAME") ?: "0.1"
    }

    // kid: Unicorn Railways for her Fire tablet.  full: the whole of OpenTTD for the Galaxy Tab S10 FE+.
    // Different app ids, so both can be installed on the same tablet.
    flavorDimensions += "edition"
    productFlavors {
        create("kid") {
            dimension = "edition"
            applicationId = "com.unicornclock.railways"
            resValue("string", "app_name", "Unicorn Railways")
        }
        create("full") {
            dimension = "edition"
            applicationId = "org.natebloom.openttd"
            resValue("string", "app_name", "OpenTTD")
        }
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
    buildFeatures { buildConfig = true }

    // libSDL2.so and libmain.so (OpenTTD) are built by ci/build-native.sh into app/src/main/jniLibs
    packaging { jniLibs { useLegacyPackaging = true } }
    androidResources { noCompress += listOf("tar", "grf", "obg", "obs", "cfg") }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}
