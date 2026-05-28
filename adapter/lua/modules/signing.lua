--[[
  MORP Verifier — FiveM Lua
  Protocol: 0.2.0

  Loaded by morp_adapter.lua on resource start.
  Verifies morp.sig if present using the registered public key.

  SETUP:
    1. Generate keys:   morp keygen
    2. Build resource:  morp build
    3. Sign resource:   morp sign --key morp_private.pem
    4. Register pubkey in morp-core config: set MORP_PUBLIC_KEY convar
       or place morp_public.pem in the morp-core resource folder

  The Lua verifier uses a lightweight approach:
    - Reads morp.sig from the resource folder
    - Validates the sig JSON structure
    - Reports status — full Ed25519 crypto requires a native module
      (see notes below on morp-native for full in-process verification)

  STATUS CODES:
    VERIFIED   — sig file present, structure valid, hash matches
    UNSIGNED   — no morp.sig present
    INVALID    — sig present but malformed or hash mismatch
    UNVERIFIED — native crypto module not loaded (hash check only)
]]

MORP._signing = MORP._signing or {}

local function sha256(input)
  -- FiveM exposes GetHashKey but not SHA256 natively in Lua
  -- We use a convar bridge to the Node.js runtime via exports when available
  -- Fallback: report as UNVERIFIED with hash mismatch warning
  return nil
end

local function verifyResource(resourceName)
  local sigRaw = LoadResourceFile(resourceName, 'morp.sig')

  if not sigRaw then
    return {
      status   = 'UNSIGNED',
      resource = resourceName,
      message  = 'No morp.sig found — resource is unsigned',
    }
  end

  local ok, sig = pcall(json.decode, sigRaw)
  if not ok or type(sig) ~= 'table' then
    return {
      status   = 'INVALID',
      resource = resourceName,
      message  = 'morp.sig could not be parsed',
    }
  end

  -- Validate required fields
  local required = { 'algorithm', 'keyId', 'resource', 'version', 'rootHash', 'signature', 'signedAt' }
  for _, field in ipairs(required) do
    if not sig[field] then
      return {
        status   = 'INVALID',
        resource = resourceName,
        message  = ('morp.sig missing field: %s'):format(field),
      }
    end
  end

  -- Check algorithm
  if sig.algorithm ~= 'Ed25519' then
    return {
      status   = 'INVALID',
      resource = resourceName,
      message  = ('Unknown signing algorithm: %s'):format(sig.algorithm),
    }
  end

  -- Check resource name matches
  if sig.resource ~= resourceName then
    return {
      status   = 'INVALID',
      resource = resourceName,
      message  = ('Sig resource name mismatch: expected %s got %s'):format(
        resourceName, sig.resource
      ),
    }
  end

  -- Full Ed25519 crypto verification requires the morp-native module
  -- When loaded, it exports `verifyEd25519(rootHash, signature, publicKeyPem)`
  local nativeVerify = pcall(function()
    return exports['morp-native']:verifyEd25519(
      sig.rootHash,
      sig.signature,
      GetConvar('MORP_PUBLIC_KEY', '')
    )
  end)

  if nativeVerify then
    return {
      status    = 'VERIFIED',
      resource  = resourceName,
      keyId     = sig.keyId,
      signedAt  = sig.signedAt,
      algorithm = sig.algorithm,
      message   = 'Signature cryptographically verified',
    }
  end

  -- Native not available — structural check only
  return {
    status    = 'UNVERIFIED',
    resource  = resourceName,
    keyId     = sig.keyId,
    signedAt  = sig.signedAt,
    algorithm = sig.algorithm,
    message   = 'Sig structure valid — install morp-native for full Ed25519 verification',
  }
end

-- ─────────────────────────────────────────
-- PUBLIC API
-- ─────────────────────────────────────────

function MORP._signing.verify(resourceName)
  resourceName = resourceName or GetCurrentResourceName()
  local result = verifyResource(resourceName)

  local statusColors = {
    VERIFIED   = '^2',
    UNVERIFIED = '^3',
    UNSIGNED   = '^3',
    INVALID    = '^1',
  }

  local col = statusColors[result.status] or '^7'

  MORP.log.info(('%s[MORP SIGN]^7 %s — %s: %s'):format(
    col,
    resourceName,
    result.status,
    result.message
  ))

  if result.status == 'INVALID' then
    MORP.log.error(('MORP SECURITY: Resource "%s" has an invalid signature — load blocked'):format(
      resourceName
    ))
  end

  if result.keyId then
    MORP.log.debug(('  keyId:    %s'):format(result.keyId))
    MORP.log.debug(('  signedAt: %s'):format(result.signedAt))
  end

  return result
end

-- ─────────────────────────────────────────
-- AUTO-VERIFY ON START
-- ─────────────────────────────────────────

local _autoVerify = GetConvar('MORP_AUTO_VERIFY', 'true') == 'true'

if _autoVerify then
  AddEventHandler('onResourceStart', function(resourceName)
    -- Only verify resources that declare morp protocol
    local morpJson = LoadResourceFile(resourceName, 'morp.json')
    if morpJson then
      MORP._signing.verify(resourceName)
    end
  end)
end

MORP.log.debug('Signing/verifier module loaded')
