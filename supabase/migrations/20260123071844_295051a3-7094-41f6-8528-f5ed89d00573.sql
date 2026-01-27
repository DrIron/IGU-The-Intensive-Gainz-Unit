-- Insert the PHI encryption key into the vault
-- Using a strong random key for encryption
SELECT vault.create_secret(
  'a-strong-32-char-encryption-key!',  -- This is a placeholder - we'll update via edge function
  'PHI_ENCRYPTION_KEY',
  'Encryption key for PHI/medical data'
);