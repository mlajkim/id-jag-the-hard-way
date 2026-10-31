package io.github.mlajkim.idthw.crypki;

import com.yahoo.athenz.crypki.CrypkiRequestFactory;
import com.yahoo.athenz.crypki.kms.KmsCaCertificateStore;
import com.yahoo.athenz.crypki.kms.KmsClient;
import com.yahoo.athenz.crypki.kms.KmsCrypkiSigner;

import java.security.PublicKey;
import java.security.cert.X509Certificate;

/** Tests configuration against the actual library without loading any key or certificate. */
public final class LocalMappingTest {
    public static void main(String[] args) {
        KmsCaCertificateStore store = new KmsCaCertificateStore(null, args[0]);
        check("default".equals(store.resolveCloudKeyId("default-ca")), "default backend mapping");
        check("special".equals(store.resolveCloudKeyId("special-ca")), "special backend mapping");
        check(store.getCertPathsByKeyId().size() == 2, "two configured CA paths");
        check("/var/run/idthw-crypki/default-ca.crt".equals(
                store.getCertPathsByKeyId().get("default-ca")), "default CA path");
        check("/var/run/idthw-crypki/special-ca.crt".equals(
                store.getCertPathsByKeyId().get("special-ca")), "special CA path");
        System.out.println("PASS: real KmsCaCertificateStore maps both signer IDs to distinct backend IDs and CA paths");

        KmsClient forbidden = new KmsClient() {
            public byte[] sign(String id, byte[] data, String algorithm) { throw new AssertionError("sign called"); }
            public PublicKey getPublicKey(String id) { throw new AssertionError("key read attempted"); }
            public X509Certificate getCaCertificate(String id) { throw new AssertionError("certificate read attempted"); }
        };
        KmsCrypkiSigner signer = new KmsCrypkiSigner(forbidden, "default-ca", "SHA256withRSA", 30);
        check("default-ca".equals(signer.resolveKeyId(null)), "null defaults to default-ca");
        check("default-ca".equals(signer.resolveKeyId("")), "empty defaults to default-ca");
        check("default-ca".equals(signer.resolveKeyId("x509-key")), "legacy default resolves to default-ca");
        check("special-ca".equals(signer.resolveKeyId("special-ca")), "explicit special-ca is preserved");
        System.out.println("PASS: real KmsCrypkiSigner resolves defaults and preserves an explicit signer ID");

        System.setProperty("athenz.crypki.kms.key_id", "default-ca");
        CrypkiRequestFactory requests = CrypkiRequestFactory.forKms();
        check("default-ca".equals(requests.resolveKeyId("sys.auth.zts", null)), "provider default");
        check("special-ca".equals(requests.resolveKeyId("sys.auth.zts", "special-ca")), "explicit request ID");
        System.out.println("PASS: real CrypkiRequestFactory.forKms uses the configured default");
        System.out.println("No key, certificate, signing operation, or cloud API was accessed by these tests");
    }

    private static void check(boolean condition, String label) {
        if (!condition) {
            throw new AssertionError(label);
        }
    }
}
