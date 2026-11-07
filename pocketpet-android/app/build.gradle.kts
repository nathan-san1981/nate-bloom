plugins {
    id("com.android.application")
}

android {
    namespace = "org.natebloom.pocketpet"
    compileSdk = 35

    defaultConfig {
        applicationId = "org.natebloom.pocketpet"
        minSdk = 26
        targetSdk = 35
        versionCode = (System.getenv("PP_VERSION_CODE") ?: "1").toInt()
        versionName = System.getenv("PP_VERSION_NAME") ?: "1.0"
    }

    signingConfigs {
        create("release") {
            // a fixed key so each new build installs over the last one and keeps the pet
            storeFile = file("../keystore/pocketpet.p12")
            storeType = "pkcs12"
            storePassword = "pocket-pet"
            keyAlias = "pocketpet"
            keyPassword = "pocket-pet"
        }
    }
    buildTypes {
        release {
            isMinifyEnabled = false
            signingConfig = signingConfigs.getByName("release")
        }
    }
    lint { checkReleaseBuilds = false }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}
