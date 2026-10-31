package io.github.mlajkim.idthw.crypki;

import com.yahoo.athenz.auth.util.Crypto;
import com.yahoo.athenz.common.server.cert.CertSigner;
import com.yahoo.athenz.common.server.cert.CertSignerFactory;
import com.yahoo.athenz.crypki.CrypkiCertSigner;
import com.yahoo.athenz.crypki.CrypkiException;
import com.yahoo.athenz.crypki.CrypkiRequestFactory;
import com.yahoo.athenz.crypki.kms.KmsCaCertificateStore;
import com.yahoo.athenz.crypki.kms.KmsClient;
import com.yahoo.athenz.crypki.kms.KmsCrypkiSigner;

import java.nio.file.Path;
import java.security.KeyFactory;
import java.security.PrivateKey;
import java.security.PublicKey;
import java.security.Signature;
import java.security.cert.X509Certificate;
import java.security.interfaces.RSAPrivateCrtKey;
import java.security.spec.RSAPublicKeySpec;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/** Local experiment only: production Crypki minting and mapping, file-backed RSA signing. */
public final class LocalFileKmsSignerFactory implements CertSignerFactory {
    @Override
    public CertSigner create() {
        String keyDir = System.getProperty("idthw.crypki.key_dir");
        if (keyDir == null || keyDir.isBlank()) {
            throw new CrypkiException("Missing idthw.crypki.key_dir");
        }
        KmsClient client = new LocalFileKmsClient(Path.of(keyDir), KmsCaCertificateStore.fromProperties());
        return new CrypkiCertSigner(new KmsCrypkiSigner(client), CrypkiRequestFactory.forKms());
    }

    static final class LocalFileKmsClient implements KmsClient {
        private final Path keyDir;
        private final KmsCaCertificateStore caCertificates;
        private final Map<String, PrivateKey> keys = new ConcurrentHashMap<>();

        LocalFileKmsClient(Path keyDir, KmsCaCertificateStore caCertificates) {
            this.keyDir = keyDir.toAbsolutePath().normalize();
            this.caCertificates = caCertificates;
        }

        private PrivateKey privateKey(String signerKeyId) {
            // Use #3498's real backend-key mapping, including for public-key lookup.
            String backendKeyId = caCertificates.resolveCloudKeyId(signerKeyId);
            if (backendKeyId == null || !backendKeyId.matches("[a-zA-Z0-9][a-zA-Z0-9_-]*")) {
                throw new CrypkiException("Local backend key id must be a safe file basename");
            }
            return keys.computeIfAbsent(backendKeyId, id -> {
                PrivateKey key = Crypto.loadPrivateKey(keyDir.resolve(id + ".key").toFile());
                if (!(key instanceof RSAPrivateCrtKey)) {
                    throw new CrypkiException("The local lab requires an RSA private key: " + id);
                }
                return key;
            });
        }

        @Override
        public byte[] sign(String keyId, byte[] data, String signingAlgorithm) {
            if (!"SHA256withRSA".equals(signingAlgorithm)) {
                throw new CrypkiException("The local lab supports SHA256withRSA only");
            }
            try {
                Signature signer = Signature.getInstance(signingAlgorithm);
                signer.initSign(privateKey(keyId));
                signer.update(data);
                return signer.sign();
            } catch (Exception ex) {
                throw new CrypkiException("Local signing failed for " + keyId, ex);
            }
        }

        @Override
        public PublicKey getPublicKey(String keyId) {
            RSAPrivateCrtKey key = (RSAPrivateCrtKey) privateKey(keyId);
            try {
                return KeyFactory.getInstance("RSA").generatePublic(
                        new RSAPublicKeySpec(key.getModulus(), key.getPublicExponent()));
            } catch (Exception ex) {
                throw new CrypkiException("Unable to derive local public key for " + keyId, ex);
            }
        }

        @Override
        public X509Certificate getCaCertificate(String keyId) {
            X509Certificate certificate = caCertificates.get(keyId);
            if (!certificate.getPublicKey().equals(getPublicKey(keyId))) {
                throw new CrypkiException("CA certificate and local signing key differ for " + keyId);
            }
            return certificate;
        }
    }
}
