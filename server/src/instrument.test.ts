// What reaches Sentry must not carry a credential or a person. These pin the
// last line of defence, beforeSend and beforeBreadcrumb, in case an
// integration fills a field the dataCollection settings were meant to stop.
import { describe, it, expect } from 'vitest';
import { scrubBreadcrumb, scrubEvent } from './instrument';

describe('scrubEvent', () => {
  it('drops the body, headers, cookies, query and user, and the URL query', () => {
    const event = scrubEvent({
      type: undefined,
      request: {
        url: 'https://api.cropbid.in/api/auth/reset-password?token=secret',
        data: { password: 'hunter2' },
        headers: { authorization: 'Bearer x' },
        cookies: { refreshToken: 'y' },
        query_string: 'token=secret',
      },
      user: { id: 'u1', email: 'a@b.c', ip_address: '1.2.3.4' },
    });
    expect(JSON.stringify(event)).not.toMatch(/secret|hunter2|Bearer|refreshToken|a@b\.c|1\.2\.3\.4/);
    expect(event.request?.url).toBe('https://api.cropbid.in/api/auth/reset-password');
  });
});

describe('scrubBreadcrumb', () => {
  it('drops console lines, which carry phone numbers and dev sign-in codes', () => {
    expect(scrubBreadcrumb({ category: 'console', message: 'Sign-in code for +9198...: 123456' })).toBeNull();
  });

  it('keeps an http breadcrumb without its query', () => {
    expect(scrubBreadcrumb({ category: 'http', data: { url: 'https://x.test/a?token=t' } })?.data?.url).toBe('https://x.test/a');
  });
});
