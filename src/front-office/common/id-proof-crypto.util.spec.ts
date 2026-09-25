import { InternalServerErrorException } from '@nestjs/common';
import { decryptIdProof, encryptIdProof } from './id-proof-crypto.util';

describe('front-office id-proof-crypto', () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
  });

  it('fails closed without FRONT_OFFICE_ID_PROOF_KEY, ignoring JWT_SECRET', () => {
    delete process.env.FRONT_OFFICE_ID_PROOF_KEY;
    process.env.JWT_SECRET = 'core';
    expect(() => encryptIdProof('1234')).toThrow(InternalServerErrorException);
  });

  it('round-trips with the dedicated key', () => {
    process.env.FRONT_OFFICE_ID_PROOF_KEY = 'front-office-key';
    expect(decryptIdProof(encryptIdProof('1234-5678'))).toBe('1234-5678');
  });

  it('cannot decrypt with a different key', () => {
    process.env.FRONT_OFFICE_ID_PROOF_KEY = 'key-one';
    const stored = encryptIdProof('1234-5678');
    process.env.FRONT_OFFICE_ID_PROOF_KEY = 'key-two';
    expect(() => decryptIdProof(stored)).toThrow();
  });
});
