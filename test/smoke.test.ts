import { describe, expect, it } from 'vitest';
import { SUPPORTED_VERSIONS } from '../src/index';

describe('scaffold', () => {
  it('supports 2.1 and 2.2 only', () => {
    expect(SUPPORTED_VERSIONS).toEqual(['2.1', '2.2']);
  });
});
