import { ESLintUtils } from "@typescript-eslint/utils";

export const errorMessage =
  "KeyService.setUserKey is deprecated and closed to new callers. All manual unlocks must go through UnlockService in @bitwarden/unlock; if you already hold a decrypted user key, use UnlockService.unlockWithDecryptedUserKey. Reach out to the KM team if neither fits. If an existing flow genuinely has no alternative, suppress with `// eslint-disable-next-line @bitwarden/key-management/no-set-user-key -- <reason>`.";

const METHOD_NAME = "setUserKey";

// Types that declare or inherit the deprecated method. Receivers resolving to anything else are
// left alone, so an unrelated service that happens to expose `setUserKey` is not reported.
// Add to this set when a new type declares the method — `implements` clauses are not traversed.
const OWNING_TYPE_NAMES = new Set(["KeyService", "DefaultKeyService"]);

const MAX_TYPE_DEPTH = 10;

/** The statically known member name, or null for dynamic access (`obj[expr]`). */
function memberName(memberExpression) {
  const property = memberExpression.property;

  if (!memberExpression.computed && property.type === "Identifier") {
    return property.name;
  }

  if (
    memberExpression.computed &&
    property.type === "Literal" &&
    typeof property.value === "string"
  ) {
    return property.value;
  }

  return null;
}

export default {
  meta: {
    type: "problem",
    docs: {
      description: "Disallow new call sites for the deprecated KeyService.setUserKey",
      category: "Best Practices",
      recommended: false,
    },
    schema: [],
  },
  create(context) {
    // Type information is only ever used to suppress a report, so the rule still fires when the
    // receiver is `any`, untyped, or otherwise unresolvable.
    const parserServices = ESLintUtils.getParserServices(context, true);
    const checker = parserServices.program?.getTypeChecker();

    function collectTypeNames(type, names, depth) {
      if (type == null || depth > MAX_TYPE_DEPTH) {
        return;
      }

      if (type.isUnionOrIntersection()) {
        for (const constituent of type.types) {
          collectTypeNames(constituent, names, depth + 1);
        }
        return;
      }

      const symbol = type.aliasSymbol ?? type.getSymbol();
      if (symbol) {
        names.add(symbol.getName());
      }

      // `this` inside a class is a type parameter constrained to the class itself, so resolving the
      // constraint is what lets `this.setUserKey()` in a subclass reach the `extends` walk below.
      if (type.isTypeParameter()) {
        collectTypeNames(checker.getBaseConstraintOfType(type), names, depth + 1);
      }

      // Walks `extends` chains, so subclasses such as ElectronKeyService are still matched.
      if (type.isClassOrInterface()) {
        for (const base of checker.getBaseTypes(type)) {
          collectTypeNames(base, names, depth + 1);
        }
      }
    }

    /** True only when the receiver's type is known and is definitely not a KeyService. */
    function isUnrelatedReceiver(objectNode) {
      if (checker == null) {
        return false;
      }

      const tsNode = parserServices.esTreeNodeToTSNodeMap.get(objectNode);
      if (tsNode == null) {
        return false;
      }

      const names = new Set();
      collectTypeNames(checker.getTypeAtLocation(tsNode), names, 0);

      if (names.size === 0) {
        return false;
      }

      for (const name of names) {
        if (OWNING_TYPE_NAMES.has(name)) {
          return false;
        }
      }

      return true;
    }

    return {
      CallExpression(node) {
        const callee = node.callee;
        if (callee.type !== "MemberExpression" || memberName(callee) !== METHOD_NAME) {
          return;
        }

        if (isUnrelatedReceiver(callee.object)) {
          return;
        }

        // Reported on the property so both the squiggle and the required
        // `eslint-disable-next-line` land on the `.setUserKey(` line.
        context.report({
          node: callee.property,
          message: errorMessage,
        });
      },
    };
  },
};
