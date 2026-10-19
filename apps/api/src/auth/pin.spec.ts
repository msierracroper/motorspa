import { hashPin, verifyPin } from './pin.js';

describe('PIN de autorización', () => {
  it('verifica el PIN correcto y rechaza los demás', async () => {
    const stored = await hashPin('1234');
    expect(stored.startsWith('scrypt$')).toBe(true);
    await expect(verifyPin('1234', stored)).resolves.toBe(true);
    await expect(verifyPin('4321', stored)).resolves.toBe(false);
    await expect(verifyPin('1234', null)).resolves.toBe(false);
    await expect(verifyPin('1234', 'texto-plano')).resolves.toBe(false);
  });

  it('dos hashes del mismo PIN son distintos (sal aleatoria)', async () => {
    expect(await hashPin('1234')).not.toBe(await hashPin('1234'));
  });
});
