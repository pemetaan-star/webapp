plugins {
    id("com.android.application")
}

val releaseKeystorePath = providers.environmentVariable("LINGGA_KEYSTORE_PATH").orNull
val releaseKeystorePassword = providers.environmentVariable("LINGGA_KEYSTORE_PASSWORD").orNull
val releaseKeyAlias = providers.environmentVariable("LINGGA_KEY_ALIAS").orNull
val releaseKeyPassword = providers.environmentVariable("LINGGA_KEY_PASSWORD").orNull
val hasReleaseSigning = listOf(
    releaseKeystorePath,
    releaseKeystorePassword,
    releaseKeyAlias,
    releaseKeyPassword,
).all { !it.isNullOrBlank() }

android {
    namespace = "com.pemetaanstar.lingga"
    compileSdk = 36

    defaultConfig {
        applicationId = "com.pemetaanstar.lingga"
        minSdk = 23
        targetSdk = 36
        versionCode = 3
        versionName = "1.2.0"
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    signingConfigs {
        if (hasReleaseSigning) {
            create("release") {
                storeFile = file(releaseKeystorePath!!)
                storePassword = releaseKeystorePassword
                keyAlias = releaseKeyAlias
                keyPassword = releaseKeyPassword
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            if (hasReleaseSigning) {
                signingConfig = signingConfigs.getByName("release")
            }
        }
    }
}

dependencies {
    implementation("androidx.activity:activity:1.12.0")
    implementation("androidx.core:core:1.18.0")
}
