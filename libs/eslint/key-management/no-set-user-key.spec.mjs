import { RuleTester } from "@typescript-eslint/rule-tester";

import rule, { errorMessage } from "./no-set-user-key.mjs";

const ruleTester = new RuleTester({
  languageOptions: {
    parserOptions: {
      projectService: {
        allowDefaultProject: ["*.ts*"],
      },
      tsconfigRootDir: __dirname + "/..",
    },
  },
});

const setup = `
  type UserId = string;
  type UserKey = { readonly key: string };
  type MockProxy<T> = T & { mockReset(): void };

  abstract class KeyService {
    abstract setUserKey(key: UserKey, userId: UserId): Promise<void>;
    abstract hasUserKey(userId: UserId): Promise<boolean>;
  }

  class DefaultKeyService implements KeyService {
    async setUserKey(key: UserKey, userId: UserId): Promise<void> {}
    async hasUserKey(userId: UserId): Promise<boolean> {
      return true;
    }
  }

  class ElectronKeyService extends DefaultKeyService {}

  class UnrelatedService {
    async setUserKey(key: UserKey, userId: UserId): Promise<void> {}
  }

  class NeighbourService {
    async setUserKeyAutoUnlock(key: UserKey): Promise<void> {}
    async setUserKeyInMemoryIfAutoUserKeySet(userId: UserId): Promise<void> {}
    async setUserKeyAndContinue(key: UserKey, userId: UserId): Promise<void> {}
  }

  declare function setUserKey(key: UserKey, userId: UserId): Promise<void>;
  declare function expect(value: unknown): { toHaveBeenCalled(): void };

  const key: UserKey = { key: "" };
  const userId: UserId = "user-id";
`;

const errors = [{ message: errorMessage }];

ruleTester.run("no-set-user-key", rule.default, {
  valid: [
    {
      name: "Declarations alone are not call sites",
      code: setup,
    },
    {
      name: "Property reference without a call (models jest.spyOn / mock access)",
      code: `
        ${setup}
        declare const keyService: KeyService;
        const spy = keyService.setUserKey;
      `,
    },
    {
      name: "Mock assertion on the method reference",
      code: `
        ${setup}
        declare const keyService: MockProxy<KeyService>;
        expect(keyService.setUserKey).toHaveBeenCalled();
      `,
    },
    {
      name: "Unrelated receiver that happens to expose setUserKey",
      code: `
        ${setup}
        void new UnrelatedService().setUserKey(key, userId);
      `,
    },
    {
      name: "Free function of the same name",
      code: `
        ${setup}
        void setUserKey(key, userId);
      `,
    },
    {
      name: "A different member of KeyService",
      code: `
        ${setup}
        declare const keyService: KeyService;
        void keyService.hasUserKey(userId);
      `,
    },
    {
      name: "Similarly named neighbour methods",
      code: `
        ${setup}
        declare const neighbour: NeighbourService;
        void neighbour.setUserKeyAutoUnlock(key);
        void neighbour.setUserKeyInMemoryIfAutoUserKeySet(userId);
        void neighbour.setUserKeyAndContinue(key, userId);
      `,
    },
  ],
  invalid: [
    {
      name: "Through the KeyService abstraction",
      code: `${setup}
declare const keyService: KeyService;
void keyService.setUserKey(key, userId);
`,
      // Pins the report onto the `setUserKey` token, which is the contract that makes
      // `eslint-disable-next-line` on the preceding line work.
      errors: [
        {
          message: errorMessage,
          line: 37,
          column: 17,
        },
      ],
    },
    {
      name: "Through the default implementation",
      code: `
        ${setup}
        void new DefaultKeyService().setUserKey(key, userId);
      `,
      errors,
    },
    {
      name: "Through a subclass that does not override the method",
      code: `
        ${setup}
        void new ElectronKeyService().setUserKey(key, userId);
      `,
      errors,
    },
    {
      name: "Internal `this` call inside a subclass",
      code: `
        ${setup}
        class Sub extends DefaultKeyService {
          async refresh(userId: UserId): Promise<void> {
            await this.setUserKey(key, userId);
          }
        }
      `,
      errors,
    },
    {
      name: "Through a mock proxy",
      code: `
        ${setup}
        declare const keyService: MockProxy<KeyService>;
        void keyService.setUserKey(key, userId);
      `,
      errors,
    },
    {
      name: "Receiver typed as `any` still reports",
      code: `
        ${setup}
        declare const keyService: any;
        void keyService.setUserKey(key, userId);
      `,
      errors,
    },
    {
      name: "Computed string access",
      code: `
        ${setup}
        declare const keyService: KeyService;
        void keyService["setUserKey"](key, userId);
      `,
      errors,
    },
    {
      name: "Optional call on a union receiver",
      code: `
        ${setup}
        declare const keyService: KeyService | undefined;
        void keyService?.setUserKey(key, userId);
      `,
      errors,
    },
    {
      name: "Each call site is reported separately",
      code: `
        ${setup}
        declare const keyService: KeyService;
        async function unlockTwice(): Promise<void> {
          await keyService.setUserKey(key, userId);
          await keyService.setUserKey(key, userId);
        }
      `,
      errors: [{ message: errorMessage }, { message: errorMessage }],
    },
  ],
});
