import { createHash, generateKeyPairSync, sign } from 'node:crypto';

type CborValue = number | string | Buffer | Map<CborValue, CborValue>;
function cbor(value: CborValue): Buffer {
  if (typeof value === 'number') return Buffer.from([value >= 0 ? value : 0x20 + (-value - 1)]);
  if (value instanceof Map)
    return Buffer.concat([
      Buffer.from([0xa0 + value.size]),
      ...Array.from(value).flatMap(([key, item]) => [cbor(key), cbor(item)]),
    ]);
  const data = typeof value === 'string' ? Buffer.from(value) : value;
  const major = typeof value === 'string' ? 0x60 : 0x40;
  return Buffer.concat([
    Buffer.from(data.length < 24 ? [major + data.length] : [major + 24, data.length]),
    data,
  ]);
}
export function passkeyFixture() {
  const pair = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const jwk = pair.publicKey.export({ format: 'jwk' });
  const credentialId = Buffer.from('staff-fixture-credential');
  const rpHash = createHash('sha256').update('localhost').digest();
  const client = (type: string, challenge: string, origin: string) =>
    Buffer.from(JSON.stringify({ type, challenge, origin, crossOrigin: false }));
  return {
    registration(challenge: string, origin = 'http://localhost:3010') {
      const cose = cbor(
        new Map<CborValue, CborValue>([
          [1, 2],
          [3, -7],
          [-1, 1],
          [-2, Buffer.from(jwk.x!, 'base64url')],
          [-3, Buffer.from(jwk.y!, 'base64url')],
        ]),
      );
      const length = Buffer.alloc(2);
      length.writeUInt16BE(credentialId.length);
      const auth = Buffer.concat([
        rpHash,
        Buffer.from([0x45, 0, 0, 0, 0]),
        Buffer.alloc(16),
        length,
        credentialId,
        cose,
      ]);
      const attestation = cbor(
        new Map<CborValue, CborValue>([
          ['fmt', 'none'],
          ['attStmt', new Map()],
          ['authData', auth],
        ]),
      );
      return {
        id: credentialId.toString('base64url'),
        rawId: credentialId.toString('base64url'),
        type: 'public-key',
        clientExtensionResults: {},
        response: {
          clientDataJSON: client('webauthn.create', challenge, origin).toString('base64url'),
          attestationObject: attestation.toString('base64url'),
        },
      };
    },
    authentication(
      challenge: string,
      counter = 1,
      origin = 'http://localhost:3010',
      verified = true,
    ) {
      const count = Buffer.alloc(4);
      count.writeUInt32BE(counter);
      const auth = Buffer.concat([rpHash, Buffer.from([verified ? 5 : 1]), count]);
      const data = client('webauthn.get', challenge, origin);
      const signature = sign(
        'sha256',
        Buffer.concat([auth, createHash('sha256').update(data).digest()]),
        pair.privateKey,
      );
      return {
        id: credentialId.toString('base64url'),
        rawId: credentialId.toString('base64url'),
        type: 'public-key',
        clientExtensionResults: {},
        response: {
          clientDataJSON: data.toString('base64url'),
          authenticatorData: auth.toString('base64url'),
          signature: signature.toString('base64url'),
        },
      };
    },
  };
}
