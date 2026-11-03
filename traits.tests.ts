import { rmSync } from "node:fs";
import { join, resolve } from "node:path";

import { initSimnet } from "@stacks/clarinet-sdk";
import type {
  ContractInterfaceFunction,
  IContractAST,
} from "@stacks/clarinet-sdk-wasm";
import fc from "fast-check";

import { strategyFor } from "./lib";
import type { EnrichedContractInterfaceFunction } from "./shared.types";
import { createIsolatedTestEnvironment } from "./test.utils";
import {
  buildTraitReferenceMap,
  enrichInterfaceWithTraitData,
  extractProjectTraitImplementations,
  getContractIdsImplementingTrait,
  getNonTestableTraitFunctions,
  isTraitReferenceFunction,
} from "./traits";
import type { ImplementedTraitType } from "./traits.types";

const isolatedTestEnvPrefix = "rendezvous-test-traits-";

describe("Trait reference processing", () => {
  it("correctly builds the trait reference map for a direct imported trait that is the first parameter", () => {
    // Arrange
    const allFunctionsInterfaces = testInputs.directImportedTrait1stParameter
      .functionsInterfaces as ContractInterfaceFunction[];

    const expected = new Map(
      Object.entries({
        "test-trait": { token: "trait_reference" },
      }),
    );

    // Act
    const actual = buildTraitReferenceMap(allFunctionsInterfaces);

    // Assert
    expect(actual).toEqual(expected);
  });

  it("correctly builds the trait reference map for a direct defined trait that is the first parameter", () => {
    // Arrange
    const allFunctionsInterfaces = testInputs.directDefinedTrait1stParameter
      .functionsInterfaces as ContractInterfaceFunction[];

    const expected = new Map(
      Object.entries({
        "test-trait": { token: "trait_reference" },
      }),
    );

    // Act
    const actual = buildTraitReferenceMap(allFunctionsInterfaces);

    // Assert
    expect(actual).toEqual(expected);
  });

  it("correctly builds the trait reference map for direct trait in two functions, public and read-only", () => {
    // Arrange
    const allFunctionsInterfaces = testInputs
      .directTraitParameterPublicAndReadOnlyFunctions
      .functionsInterfaces as ContractInterfaceFunction[];

    const expected = new Map(
      Object.entries({
        "test-trait": { token: "trait_reference" },
        "invariant-trait": { token: "trait_reference" },
      }),
    );

    // Act
    const actual = buildTraitReferenceMap(allFunctionsInterfaces);

    // Assert
    expect(actual).toEqual(expected);
  });

  it("correctly builds the trait reference map for a direct trait that is the second parameter", () => {
    // Arrange
    const allFunctionsInterfaces = testInputs.directTrait2ndParameter
      .functionsInterfaces as ContractInterfaceFunction[];

    const expected = new Map(
      Object.entries({
        "test-trait": { token: "trait_reference" },
      }),
    );

    // Act
    const actual = buildTraitReferenceMap(allFunctionsInterfaces);

    // Assert
    expect(actual).toEqual(expected);
  });

  it("correctly builds the trait reference map for a direct trait that is the fifth parameter", () => {
    // Arrange
    const allFunctionsInterfaces = testInputs.directTrait5thParameter
      .functionsInterfaces as ContractInterfaceFunction[];

    const expected = new Map(
      Object.entries({
        "test-trait": { e: "trait_reference" },
      }),
    );

    // Act
    const actual = buildTraitReferenceMap(allFunctionsInterfaces);

    // Assert
    expect(actual).toEqual(expected);
  });

  it("correctly builds the trait reference map for a tuple nested trait that is the first parameter", () => {
    // Arrange
    const allFunctionsInterfaces = testInputs.tupleTraitParameter
      .functionsInterfaces as ContractInterfaceFunction[];

    const expected = new Map(
      Object.entries({
        "test-trait": {
          "tuple-param": { tuple: { token: "trait_reference" } },
        },
      }),
    );

    // Act
    const actual = buildTraitReferenceMap(allFunctionsInterfaces);

    // Assert
    expect(actual).toEqual(expected);
  });

  it("correctly builds the trait reference map for a list nested trait", () => {
    // Arrange
    const allFunctionsInterfaces = testInputs.listTraitParameter
      .functionsInterfaces as ContractInterfaceFunction[];

    const expected = new Map(
      Object.entries({
        "test-trait": {
          "token-list": { list: "trait_reference" },
        },
      }),
    );

    // Act
    const actual = buildTraitReferenceMap(allFunctionsInterfaces);

    // Assert
    expect(actual).toEqual(expected);
  });

  it("correctly builds the trait reference map for a response ok branch nested trait", () => {
    // Arrange
    const allFunctionsInterfaces = testInputs.responseOkTraitParameter
      .functionsInterfaces as ContractInterfaceFunction[];

    const expected = new Map(
      Object.entries({
        "test-trait": {
          "resp-trait-param": { response: { ok: "trait_reference" } },
        },
      }),
    );

    // Act
    const actual = buildTraitReferenceMap(allFunctionsInterfaces);

    // Assert
    expect(actual).toEqual(expected);
  });

  it("correctly builds the trait reference map for a response error branch nested trait", () => {
    // Arrange
    const allFunctionsInterfaces = testInputs.responseErrTraitParameter
      .functionsInterfaces as ContractInterfaceFunction[];

    const expected = new Map(
      Object.entries({
        "test-trait": {
          "resp-trait-param": { response: { error: "trait_reference" } },
        },
      }),
    );

    // Act
    const actual = buildTraitReferenceMap(allFunctionsInterfaces);

    // Assert
    expect(actual).toEqual(expected);
  });

  it("correctly builds the trait reference map for a response both branches nested trait", () => {
    // Arrange
    const allFunctionsInterfaces = testInputs.responseBothTraitParameter
      .functionsInterfaces as ContractInterfaceFunction[];

    const expected = new Map(
      Object.entries({
        "test-trait": {
          "resp-trait-param": {
            response: { ok: "trait_reference", error: "trait_reference" },
          },
        },
      }),
    );

    // Act
    const actual = buildTraitReferenceMap(allFunctionsInterfaces);

    // Assert
    expect(actual).toEqual(expected);
  });

  it("correctly builds the trait reference map for an optional nested trait", () => {
    // Arrange
    const allFunctionsInterfaces = testInputs.optionalTraitParameter
      .functionsInterfaces as ContractInterfaceFunction[];

    const expected = new Map(
      Object.entries({
        "test-trait": {
          "opt-trait": {
            optional: "trait_reference",
          },
        },
      }),
    );

    // Act
    const actual = buildTraitReferenceMap(allFunctionsInterfaces);

    // Assert
    expect(actual).toEqual(expected);
  });

  it("correctly builds the trait reference map for list-tuple nested traits", () => {
    // Arrange
    const allFunctionsInterfaces = testInputs.listTupleNestedTrait
      .functionsInterfaces as ContractInterfaceFunction[];

    const expected = new Map(
      Object.entries({
        "test-mixed-traits": {
          "list-tuple-trait": {
            list: { tuple: { "mad-inner": "trait_reference" } },
          },
        },
      }),
    );

    // Act
    const actual = buildTraitReferenceMap(allFunctionsInterfaces);

    // Assert
    expect(actual).toEqual(expected);
  });

  it("correctly builds the trait reference map for mixed direct and nested traits", () => {
    // Arrange
    const allFunctionsInterfaces = testInputs.mixedDirectAndNestedTraits
      .functionsInterfaces as ContractInterfaceFunction[];

    const expected = new Map(
      Object.entries({
        "test-mixed-traits": {
          direct: "trait_reference",
          "list-1": { list: "trait_reference" },
          mad: {
            tuple: {
              "list-mad": {
                list: { tuple: { "mad-inner": "trait_reference" } },
              },
            },
          },
        },
      }),
    );

    // Act
    const actual = buildTraitReferenceMap(allFunctionsInterfaces);

    // Assert
    expect(actual).toEqual(expected);
  });

  it("correctly builds the trait reference map for list-response nested traits", () => {
    // Arrange
    const allFunctionsInterfaces = testInputs.listResponseNestedTrait
      .functionsInterfaces as ContractInterfaceFunction[];

    const expected = new Map(
      Object.entries({
        "send-tokens": {
          transfers: {
            list: {
              tuple: {
                token: "trait_reference",
              },
            },
          },
        },
        "test-list-response": {
          "token-list": {
            list: {
              response: {
                ok: "trait_reference",
              },
            },
          },
        },
        transfer: {
          "one-transfer": {
            tuple: {
              token: "trait_reference",
            },
          },
        },
      }),
    );

    // Act
    const actual = buildTraitReferenceMap(allFunctionsInterfaces);

    // Assert
    expect(actual).toEqual(expected);
  });

  it("correctly builds the trait reference map for list-optional nested traits", () => {
    // Arrange
    const allFunctionsInterfaces = testInputs.listOptionalNestedTrait
      .functionsInterfaces as ContractInterfaceFunction[];

    const expected = new Map(
      Object.entries({
        "send-tokens": {
          transfers: {
            list: {
              tuple: {
                token: "trait_reference",
              },
            },
          },
        },
        "test-list-response": {
          "token-list": {
            list: {
              optional: "trait_reference",
            },
          },
        },
        transfer: {
          "one-transfer": {
            tuple: {
              token: "trait_reference",
            },
          },
        },
      }),
    );

    // Act
    const actual = buildTraitReferenceMap(allFunctionsInterfaces);

    // Assert
    expect(actual).toEqual(expected);
  });

  it("correctly enriches interface with trait reference data for a direct imported trait that is the first parameter", () => {
    // Arrange
    const allFunctionsInterfaces = (
      testInputs.directImportedTrait1stParameter
        .functionsInterfaces as ContractInterfaceFunction[]
    ).filter((f) => f.name !== "update-context");

    const traitReferenceMap = buildTraitReferenceMap(allFunctionsInterfaces);

    const ast = testInputs.directImportedTrait1stParameter
      .ast as any as IContractAST;

    const targetContractId = "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.trait";

    const expected = new Map(
      Object.entries({
        [targetContractId]: [
          {
            name: "function",
            access: "public",
            args: [],
            outputs: {
              type: {
                response: {
                  error: "none",
                  ok: "bool",
                },
              },
            },
          },
          {
            name: "test-no-trait",
            access: "public",
            args: [],
            outputs: {
              type: {
                response: {
                  error: "none",
                  ok: "bool",
                },
              },
            },
          },
          {
            name: "test-trait",
            access: "public",
            args: [
              {
                name: "token",
                type: {
                  trait_reference: {
                    name: "ft-trait",
                    import: {
                      Imported: {
                        name: "sip-010-trait",
                        contract_identifier: {
                          name: "sip-010-trait-ft-standard",
                          issuer: [
                            22,
                            [
                              9, 159, 184, 137, 38, 216, 47, 48, 178, 244, 14,
                              175, 62, 228, 35, 203, 114, 91, 219, 59,
                            ],
                          ],
                        },
                      },
                    },
                  },
                },
              },
            ],
            outputs: {
              type: {
                response: {
                  error: "none",
                  ok: "bool",
                },
              },
            },
          },
        ],
      }),
    );

    // Act
    const actual = enrichInterfaceWithTraitData(
      ast,
      traitReferenceMap,
      allFunctionsInterfaces,
      targetContractId,
    );

    // Assert
    expect(actual).toEqual(expected);
  });

  it("correctly enriches interface with trait reference data for a direct defined trait that is the first parameter", () => {
    // Arrange
    const allFunctionsInterfaces = (
      testInputs.directImportedTrait1stParameter
        .functionsInterfaces as ContractInterfaceFunction[]
    ).filter((f) => f.name !== "update-context");

    const traitReferenceMap = buildTraitReferenceMap(allFunctionsInterfaces);

    const ast = testInputs.directDefinedTrait1stParameter
      .ast as any as IContractAST;

    const targetContractId = "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.trait";

    const expected = new Map(
      Object.entries({
        [targetContractId]: [
          {
            name: "function",
            access: "public",
            args: [],
            outputs: {
              type: {
                response: {
                  error: "none",
                  ok: "bool",
                },
              },
            },
          },
          {
            name: "test-no-trait",
            access: "public",
            args: [],
            outputs: {
              type: {
                response: {
                  error: "none",
                  ok: "bool",
                },
              },
            },
          },
          {
            name: "test-trait",
            access: "public",
            args: [
              {
                name: "token",
                type: {
                  trait_reference: {
                    name: "ft-trait",
                    import: {
                      Defined: {
                        name: "sip-010-trait",
                        contract_identifier: {
                          name: "sip-010-trait-ft-standard",
                          issuer: [
                            22,
                            [
                              9, 159, 184, 137, 38, 216, 47, 48, 178, 244, 14,
                              175, 62, 228, 35, 203, 114, 91, 219, 59,
                            ],
                          ],
                        },
                      },
                    },
                  },
                },
              },
            ],
            outputs: {
              type: {
                response: {
                  error: "none",
                  ok: "bool",
                },
              },
            },
          },
        ],
      }),
    );

    // Act
    const actual = enrichInterfaceWithTraitData(
      ast,
      traitReferenceMap,
      allFunctionsInterfaces,
      targetContractId,
    );

    // Assert
    expect(actual).toEqual(expected);
  });

  it("correctly enriches interface with trait reference data for a direct trait that is the first parameter", () => {
    // Arrange
    const allFunctionsInterfaces = (
      testInputs.directTraitParameterPublicAndReadOnlyFunctions
        .functionsInterfaces as ContractInterfaceFunction[]
    ).filter((f) => f.name !== "update-context");

    const traitReferenceMap = buildTraitReferenceMap(allFunctionsInterfaces);

    const ast = testInputs.directTraitParameterPublicAndReadOnlyFunctions
      .ast as any as IContractAST;

    const targetContractId = "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.trait";

    const expected = new Map(
      Object.entries({
        [targetContractId]: [
          {
            name: "function",
            access: "public",
            args: [],
            outputs: {
              type: {
                response: {
                  error: "none",
                  ok: "bool",
                },
              },
            },
          },
          {
            name: "test-no-trait",
            access: "public",
            args: [],
            outputs: {
              type: {
                response: {
                  error: "none",
                  ok: "bool",
                },
              },
            },
          },
          {
            name: "test-trait",
            access: "public",
            args: [
              {
                name: "token",
                type: {
                  trait_reference: {
                    name: "ft-trait",
                    import: {
                      Imported: {
                        name: "sip-010-trait",
                        contract_identifier: {
                          name: "sip-010-trait-ft-standard",
                          issuer: [
                            22,
                            [
                              9, 159, 184, 137, 38, 216, 47, 48, 178, 244, 14,
                              175, 62, 228, 35, 203, 114, 91, 219, 59,
                            ],
                          ],
                        },
                      },
                    },
                  },
                },
              },
            ],
            outputs: {
              type: {
                response: {
                  error: "none",
                  ok: "bool",
                },
              },
            },
          },
          {
            name: "invariant-trait",
            access: "read_only",
            args: [
              {
                name: "token",
                type: {
                  trait_reference: {
                    name: "ft-trait",
                    import: {
                      Imported: {
                        name: "sip-010-trait",
                        contract_identifier: {
                          name: "sip-010-trait-ft-standard",
                          issuer: [
                            22,
                            [
                              9, 159, 184, 137, 38, 216, 47, 48, 178, 244, 14,
                              175, 62, 228, 35, 203, 114, 91, 219, 59,
                            ],
                          ],
                        },
                      },
                    },
                  },
                },
              },
            ],
            outputs: {
              type: "bool",
            },
          },
        ],
      }),
    );

    // Act
    const actual = enrichInterfaceWithTraitData(
      ast,
      traitReferenceMap,
      allFunctionsInterfaces,
      targetContractId,
    );

    // Assert
    expect(actual).toEqual(expected);
  });

  it("correctly enriches interface with trait reference data for a direct trait that is the second parameter", () => {
    // Arrange
    const allFunctionsInterfaces = (
      testInputs.directTrait2ndParameter
        .functionsInterfaces as ContractInterfaceFunction[]
    ).filter((f) => f.name !== "update-context");

    const traitReferenceMap = buildTraitReferenceMap(allFunctionsInterfaces);

    const ast = testInputs.directTrait2ndParameter.ast as any as IContractAST;

    const targetContractId = "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.trait";

    const expected = new Map(
      Object.entries({
        [targetContractId]: [
          {
            name: "function",
            access: "public",
            args: [],
            outputs: {
              type: {
                response: {
                  error: "none",
                  ok: "bool",
                },
              },
            },
          },
          {
            name: "test-no-trait",
            access: "public",
            args: [],
            outputs: {
              type: {
                response: {
                  error: "none",
                  ok: "bool",
                },
              },
            },
          },
          {
            name: "test-trait",
            access: "public",
            args: [
              { name: "a", type: "uint128" },
              {
                name: "token",
                type: {
                  trait_reference: {
                    name: "ft-trait",
                    import: {
                      Imported: {
                        name: "sip-010-trait",
                        contract_identifier: {
                          name: "sip-010-trait-ft-standard",
                          issuer: [
                            22,
                            [
                              9, 159, 184, 137, 38, 216, 47, 48, 178, 244, 14,
                              175, 62, 228, 35, 203, 114, 91, 219, 59,
                            ],
                          ],
                        },
                      },
                    },
                  },
                },
              },
            ],
            outputs: {
              type: {
                response: {
                  error: "none",
                  ok: "bool",
                },
              },
            },
          },
        ],
      }),
    );

    // Act
    const actual = enrichInterfaceWithTraitData(
      ast,
      traitReferenceMap,
      allFunctionsInterfaces,
      targetContractId,
    );

    // Assert
    expect(actual).toEqual(expected);
  });

  it("correctly enriches interface with trait reference data for a direct trait that is the fifth parameter", () => {
    // Arrange
    const allFunctionsInterfaces = (
      testInputs.directTrait5thParameter
        .functionsInterfaces as ContractInterfaceFunction[]
    ).filter((f) => f.name !== "update-context");

    const traitReferenceMap = buildTraitReferenceMap(allFunctionsInterfaces);

    const ast = testInputs.directTrait5thParameter.ast as any as IContractAST;

    const targetContractId = "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.trait";

    const expected = new Map(
      Object.entries({
        [targetContractId]: [
          {
            name: "function",
            access: "public",
            args: [],
            outputs: {
              type: {
                response: {
                  error: "none",
                  ok: "bool",
                },
              },
            },
          },
          {
            name: "test-no-trait",
            access: "public",
            args: [],
            outputs: {
              type: {
                response: {
                  error: "none",
                  ok: "bool",
                },
              },
            },
          },
          {
            name: "test-trait",
            access: "public",
            args: [
              { name: "a", type: "uint128" },
              { name: "b", type: "int128" },
              { name: "c", type: "bool" },
              {
                name: "d",
                type: {
                  "string-ascii": {
                    length: 10,
                  },
                },
              },
              {
                name: "e",
                type: {
                  trait_reference: {
                    name: "ft-trait",
                    import: {
                      Imported: {
                        name: "sip-010-trait",
                        contract_identifier: {
                          name: "sip-010-trait-ft-standard",
                          issuer: [
                            22,
                            [
                              9, 159, 184, 137, 38, 216, 47, 48, 178, 244, 14,
                              175, 62, 228, 35, 203, 114, 91, 219, 59,
                            ],
                          ],
                        },
                      },
                    },
                  },
                },
              },
            ],
            outputs: {
              type: {
                response: {
                  error: "none",
                  ok: "bool",
                },
              },
            },
          },
        ],
      }),
    );

    // Act
    const actual = enrichInterfaceWithTraitData(
      ast,
      traitReferenceMap,
      allFunctionsInterfaces,
      targetContractId,
    );

    // Assert
    expect(actual).toEqual(expected);
  });

  it("correctly enriches interface with trait reference data for a tuple nested trait that is the first parameter", () => {
    // Arrange
    const allFunctionsInterfaces = (
      testInputs.tupleTraitParameter
        .functionsInterfaces as ContractInterfaceFunction[]
    ).filter((f) => f.name !== "update-context");

    const traitReferenceMap = buildTraitReferenceMap(allFunctionsInterfaces);

    const ast = testInputs.tupleTraitParameter.ast as any as IContractAST;

    const targetContractId = "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.trait";

    const expected = new Map(
      Object.entries({
        [targetContractId]: [
          {
            name: "function",
            access: "public",
            args: [],
            outputs: {
              type: {
                response: {
                  error: "none",
                  ok: "bool",
                },
              },
            },
          },
          {
            name: "test-no-trait",
            access: "public",
            args: [],
            outputs: {
              type: {
                response: {
                  error: "none",
                  ok: "bool",
                },
              },
            },
          },
          {
            name: "test-trait",
            access: "public",
            args: [
              {
                name: "tuple-param",
                type: {
                  tuple: [
                    {
                      name: "token",
                      type: {
                        trait_reference: {
                          name: "ft-trait",
                          import: {
                            Imported: {
                              name: "sip-010-trait",
                              contract_identifier: {
                                name: "sip-010-trait-ft-standard",
                                issuer: [
                                  22,
                                  [
                                    9, 159, 184, 137, 38, 216, 47, 48, 178, 244,
                                    14, 175, 62, 228, 35, 203, 114, 91, 219, 59,
                                  ],
                                ],
                              },
                            },
                          },
                        },
                      },
                    },
                  ],
                },
              },
            ],
            outputs: {
              type: {
                response: {
                  ok: "bool",
                  error: "none",
                },
              },
            },
          },
        ],
      }),
    );

    // Act
    const actual = enrichInterfaceWithTraitData(
      ast,
      traitReferenceMap,
      allFunctionsInterfaces,
      targetContractId,
    );

    // Assert
    expect(actual).toEqual(expected);
  });

  it("correctly enriches interface with trait reference data for a first parameter tuple nested trait followed by a non-trait tuple parameter", () => {
    // Arrange
    const allFunctionsInterfaces = (
      testInputs.tupleTraitParameterFollowedByNonTraitTupleParameter
        .functionsInterfaces as ContractInterfaceFunction[]
    ).filter((f) => f.name !== "update-context");

    const traitReferenceMap = buildTraitReferenceMap(allFunctionsInterfaces);

    const ast = testInputs.tupleTraitParameterFollowedByNonTraitTupleParameter
      .ast as any as IContractAST;

    const targetContractId = "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.trait";

    const expected = new Map(
      Object.entries({
        [targetContractId]: [
          {
            name: "create",
            access: "public",
            args: [
              {
                name: "request-details",
                type: {
                  tuple: [
                    {
                      name: "token-x-trait",
                      type: {
                        trait_reference: {
                          import: {
                            Imported: {
                              contract_identifier: {
                                issuer: [
                                  22,
                                  [
                                    64, 45, 162, 192, 121, 229, 211, 29, 88,
                                    185, 207, 199, 40, 109, 27, 30, 178, 247,
                                    131, 78,
                                  ],
                                ],
                                name: "trait-sip-010",
                              },
                              name: "sip-010-trait",
                            },
                          },
                          name: "ft-trait",
                        },
                      },
                    },
                    {
                      name: "token-y-trait",
                      type: {
                        trait_reference: {
                          import: {
                            Imported: {
                              contract_identifier: {
                                issuer: [
                                  22,
                                  [
                                    64, 45, 162, 192, 121, 229, 211, 29, 88,
                                    185, 207, 199, 40, 109, 27, 30, 178, 247,
                                    131, 78,
                                  ],
                                ],
                                name: "trait-sip-010",
                              },
                              name: "sip-010-trait",
                            },
                          },
                          name: "ft-trait",
                        },
                      },
                    },
                  ],
                },
              },
              {
                name: "verify-params",
                type: {
                  tuple: [
                    {
                      name: "proof",
                      type: {
                        tuple: [
                          {
                            name: "tx-index",
                            type: "uint128",
                          },
                        ],
                      },
                    },
                  ],
                },
              },
            ],
            outputs: {
              type: {
                response: {
                  ok: "bool",
                  error: "none",
                },
              },
            },
          },
        ],
      }),
    );

    // Act
    const actual = enrichInterfaceWithTraitData(
      ast,
      traitReferenceMap,
      allFunctionsInterfaces,
      targetContractId,
    );

    // Assert
    expect(actual).toEqual(expected);
  });

  it("correctly enriches interface with trait reference data for a list nested trait", () => {
    // Arrange
    const allFunctionsInterfaces = (
      testInputs.listTraitParameter
        .functionsInterfaces as ContractInterfaceFunction[]
    ).filter((f) => f.name !== "update-context");

    const traitReferenceMap = buildTraitReferenceMap(allFunctionsInterfaces);

    const ast = testInputs.listTraitParameter.ast as any as IContractAST;

    const targetContractId = "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.trait";

    const expected = new Map(
      Object.entries({
        [targetContractId]: [
          {
            name: "function",
            access: "public",
            args: [],
            outputs: {
              type: {
                response: {
                  error: "none",
                  ok: "bool",
                },
              },
            },
          },
          {
            name: "test-no-trait",
            access: "public",
            args: [],
            outputs: {
              type: {
                response: {
                  error: "none",
                  ok: "bool",
                },
              },
            },
          },
          {
            name: "test-trait",
            access: "public",
            args: [
              {
                name: "token-list",
                type: {
                  list: {
                    length: 5,
                    type: {
                      trait_reference: {
                        name: "ft-trait",
                        import: {
                          Imported: {
                            name: "sip-010-trait",
                            contract_identifier: {
                              name: "sip-010-trait-ft-standard",
                              issuer: [
                                22,
                                [
                                  9, 159, 184, 137, 38, 216, 47, 48, 178, 244,
                                  14, 175, 62, 228, 35, 203, 114, 91, 219, 59,
                                ],
                              ],
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
            ],
            outputs: {
              type: {
                response: {
                  ok: "bool",
                  error: "none",
                },
              },
            },
          },
        ],
      }),
    );

    // Act
    const actual = enrichInterfaceWithTraitData(
      ast,
      traitReferenceMap,
      allFunctionsInterfaces,
      targetContractId,
    );

    // Assert
    expect(actual).toEqual(expected);
  });

  it("correctly enriches interface with trait reference data for a response ok branch nested trait", () => {
    // Arrange
    const allFunctionsInterfaces = (
      testInputs.responseOkTraitParameter
        .functionsInterfaces as ContractInterfaceFunction[]
    ).filter((f) => f.name !== "update-context");

    const traitReferenceMap = buildTraitReferenceMap(allFunctionsInterfaces);

    const ast = testInputs.responseOkTraitParameter.ast as any as IContractAST;

    const targetContractId = "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.trait";

    const expected = new Map(
      Object.entries({
        [targetContractId]: [
          {
            name: "function",
            access: "public",
            args: [],
            outputs: {
              type: {
                response: {
                  error: "none",
                  ok: "bool",
                },
              },
            },
          },
          {
            name: "test-no-trait",
            access: "public",
            args: [],
            outputs: {
              type: {
                response: {
                  error: "none",
                  ok: "bool",
                },
              },
            },
          },
          {
            name: "test-trait",
            access: "public",
            args: [
              {
                name: "resp-trait-param",
                type: {
                  response: {
                    ok: {
                      trait_reference: {
                        name: "ft-trait",
                        import: {
                          Imported: {
                            name: "sip-010-trait",
                            contract_identifier: {
                              name: "sip-010-trait-ft-standard",
                              issuer: [
                                22,
                                [
                                  9, 159, 184, 137, 38, 216, 47, 48, 178, 244,
                                  14, 175, 62, 228, 35, 203, 114, 91, 219, 59,
                                ],
                              ],
                            },
                          },
                        },
                      },
                    },
                    error: "uint128",
                  },
                },
              },
            ],
            outputs: {
              type: {
                response: {
                  ok: "bool",
                  error: "none",
                },
              },
            },
          },
        ],
      }),
    );

    // Act
    const actual = enrichInterfaceWithTraitData(
      ast,
      traitReferenceMap,
      allFunctionsInterfaces,
      targetContractId,
    );

    // Assert
    expect(actual).toEqual(expected);
  });

  it("correctly enriches interface with trait reference data for a response error branch nested trait", () => {
    // Arrange
    const allFunctionsInterfaces = (
      testInputs.responseErrTraitParameter
        .functionsInterfaces as ContractInterfaceFunction[]
    ).filter((f) => f.name !== "update-context");

    const traitReferenceMap = buildTraitReferenceMap(allFunctionsInterfaces);

    const ast = testInputs.responseErrTraitParameter.ast as any as IContractAST;

    const targetContractId = "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.trait";

    const expected = new Map(
      Object.entries({
        [targetContractId]: [
          {
            name: "function",
            access: "public",
            args: [],
            outputs: {
              type: {
                response: {
                  error: "none",
                  ok: "bool",
                },
              },
            },
          },
          {
            name: "test-no-trait",
            access: "public",
            args: [],
            outputs: {
              type: {
                response: {
                  error: "none",
                  ok: "bool",
                },
              },
            },
          },
          {
            name: "test-trait",
            access: "public",
            args: [
              {
                name: "resp-trait-param",
                type: {
                  response: {
                    ok: "uint128",
                    error: {
                      trait_reference: {
                        name: "ft-trait",
                        import: {
                          Imported: {
                            name: "sip-010-trait",
                            contract_identifier: {
                              name: "sip-010-trait-ft-standard",
                              issuer: [
                                22,
                                [
                                  9, 159, 184, 137, 38, 216, 47, 48, 178, 244,
                                  14, 175, 62, 228, 35, 203, 114, 91, 219, 59,
                                ],
                              ],
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
            ],
            outputs: {
              type: {
                response: {
                  ok: "bool",
                  error: "none",
                },
              },
            },
          },
        ],
      }),
    );

    // Act
    const actual = enrichInterfaceWithTraitData(
      ast,
      traitReferenceMap,
      allFunctionsInterfaces,
      targetContractId,
    );

    // Assert
    expect(actual).toEqual(expected);
  });

  it("correctly enriches interface with trait reference data for a response both branches nested trait", () => {
    // Arrange
    const allFunctionsInterfaces = (
      testInputs.responseBothTraitParameter
        .functionsInterfaces as ContractInterfaceFunction[]
    ).filter((f) => f.name !== "update-context");

    const traitReferenceMap = buildTraitReferenceMap(allFunctionsInterfaces);

    const ast = testInputs.responseBothTraitParameter
      .ast as any as IContractAST;

    const targetContractId = "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.trait";

    const expected = new Map(
      Object.entries({
        [targetContractId]: [
          {
            name: "function",
            access: "public",
            args: [],
            outputs: {
              type: {
                response: {
                  error: "none",
                  ok: "bool",
                },
              },
            },
          },
          {
            name: "test-no-trait",
            access: "public",
            args: [],
            outputs: {
              type: {
                response: {
                  error: "none",
                  ok: "bool",
                },
              },
            },
          },
          {
            name: "test-trait",
            access: "public",
            args: [
              {
                name: "resp-trait-param",
                type: {
                  response: {
                    ok: {
                      trait_reference: {
                        name: "ft-trait",
                        import: {
                          Imported: {
                            name: "sip-010-trait",
                            contract_identifier: {
                              name: "sip-010-trait-ft-standard",
                              issuer: [
                                22,
                                [
                                  9, 159, 184, 137, 38, 216, 47, 48, 178, 244,
                                  14, 175, 62, 228, 35, 203, 114, 91, 219, 59,
                                ],
                              ],
                            },
                          },
                        },
                      },
                    },
                    error: {
                      trait_reference: {
                        name: "ft-trait",
                        import: {
                          Imported: {
                            name: "sip-010-trait",
                            contract_identifier: {
                              name: "sip-010-trait-ft-standard",
                              issuer: [
                                22,
                                [
                                  9, 159, 184, 137, 38, 216, 47, 48, 178, 244,
                                  14, 175, 62, 228, 35, 203, 114, 91, 219, 59,
                                ],
                              ],
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
            ],
            outputs: {
              type: {
                response: {
                  ok: "bool",
                  error: "none",
                },
              },
            },
          },
        ],
      }),
    );

    // Act
    const actual = enrichInterfaceWithTraitData(
      ast,
      traitReferenceMap,
      allFunctionsInterfaces,
      targetContractId,
    );

    // Assert
    expect(actual).toEqual(expected);
  });

  it("correctly enriches interface with trait reference data for a optional nested trait", () => {
    // Arrange
    const allFunctionsInterfaces = (
      testInputs.optionalTraitParameter
        .functionsInterfaces as ContractInterfaceFunction[]
    ).filter((f) => f.name !== "update-context");

    const traitReferenceMap = buildTraitReferenceMap(allFunctionsInterfaces);

    const ast = testInputs.optionalTraitParameter.ast as any as IContractAST;

    const targetContractId = "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.trait";

    const expected = new Map(
      Object.entries({
        [targetContractId]: [
          {
            name: "function",
            access: "public",
            args: [],
            outputs: {
              type: {
                response: {
                  error: "none",
                  ok: "bool",
                },
              },
            },
          },
          {
            name: "test-no-trait",
            access: "public",
            args: [],
            outputs: {
              type: {
                response: {
                  error: "none",
                  ok: "bool",
                },
              },
            },
          },
          {
            name: "test-trait",
            access: "public",
            args: [
              {
                name: "opt-trait",
                type: {
                  optional: {
                    trait_reference: {
                      name: "ft-trait",
                      import: {
                        Imported: {
                          name: "sip-010-trait",
                          contract_identifier: {
                            name: "sip-010-trait-ft-standard",
                            issuer: [
                              22,
                              [
                                9, 159, 184, 137, 38, 216, 47, 48, 178, 244, 14,
                                175, 62, 228, 35, 203, 114, 91, 219, 59,
                              ],
                            ],
                          },
                        },
                      },
                    },
                  },
                },
              },
            ],
            outputs: {
              type: {
                response: {
                  ok: "bool",
                  error: "none",
                },
              },
            },
          },
        ],
      }),
    );

    // Act
    const actual = enrichInterfaceWithTraitData(
      ast,
      traitReferenceMap,
      allFunctionsInterfaces,
      targetContractId,
    );

    // Assert
    expect(actual).toEqual(expected);
  });

  it("correctly enriches interface with trait reference data for a list-tuple-nested trait", () => {
    // Arrange
    const allFunctionsInterfaces = (
      testInputs.listTupleNestedTrait
        .functionsInterfaces as ContractInterfaceFunction[]
    ).filter((f) => f.name !== "update-context");

    const traitReferenceMap = buildTraitReferenceMap(allFunctionsInterfaces);

    const ast = testInputs.listTupleNestedTrait.ast as any as IContractAST;

    const targetContractId = "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.trait";

    const expected = new Map(
      Object.entries({
        [targetContractId]: [
          {
            name: "function",
            access: "public",
            args: [],
            outputs: {
              type: {
                response: {
                  error: "none",
                  ok: "bool",
                },
              },
            },
          },
          {
            name: "test-mixed-traits",
            access: "public",
            args: [
              {
                name: "list-tuple-trait",
                type: {
                  list: {
                    length: 4,
                    type: {
                      tuple: [
                        {
                          name: "mad-inner",
                          type: {
                            trait_reference: {
                              name: "ft-trait",
                              import: {
                                Imported: {
                                  name: "sip-010-trait",
                                  contract_identifier: {
                                    name: "sip-010-trait-ft-standard",
                                    issuer: [
                                      22,
                                      [
                                        9, 159, 184, 137, 38, 216, 47, 48, 178,
                                        244, 14, 175, 62, 228, 35, 203, 114, 91,
                                        219, 59,
                                      ],
                                    ],
                                  },
                                },
                              },
                            },
                          },
                        },
                      ],
                    },
                  },
                },
              },
            ],
            outputs: {
              type: {
                response: {
                  ok: "bool",
                  error: "none",
                },
              },
            },
          },
        ],
      }),
    );

    // Act
    const actual = enrichInterfaceWithTraitData(
      ast,
      traitReferenceMap,
      allFunctionsInterfaces,
      targetContractId,
    );

    // Assert
    expect(actual).toEqual(expected);
  });

  it("correctly enriches interface with trait reference data for mixed direct and nested traits", () => {
    // Arrange
    const allFunctionsInterfaces = (
      testInputs.mixedDirectAndNestedTraits
        .functionsInterfaces as ContractInterfaceFunction[]
    ).filter((f) => f.name !== "update-context");

    const traitReferenceMap = buildTraitReferenceMap(allFunctionsInterfaces);

    const ast = testInputs.mixedDirectAndNestedTraits
      .ast as any as IContractAST;

    const targetContractId = "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.trait";

    const expected = new Map(
      Object.entries({
        [targetContractId]: [
          {
            name: "function",
            access: "public",
            args: [],
            outputs: {
              type: {
                response: {
                  error: "none",
                  ok: "bool",
                },
              },
            },
          },
          {
            name: "test-mixed-traits",
            access: "public",
            args: [
              {
                name: "direct",
                type: {
                  trait_reference: {
                    name: "ft-trait",
                    import: {
                      Imported: {
                        name: "sip-010-trait",
                        contract_identifier: {
                          name: "sip-010-trait-ft-standard",
                          issuer: [
                            22,
                            [
                              9, 159, 184, 137, 38, 216, 47, 48, 178, 244, 14,
                              175, 62, 228, 35, 203, 114, 91, 219, 59,
                            ],
                          ],
                        },
                      },
                    },
                  },
                },
              },
              {
                name: "list-1",
                type: {
                  list: {
                    length: 4,
                    type: {
                      trait_reference: {
                        name: "ft-trait",
                        import: {
                          Imported: {
                            name: "sip-010-trait",
                            contract_identifier: {
                              name: "sip-010-trait-ft-standard",
                              issuer: [
                                22,
                                [
                                  9, 159, 184, 137, 38, 216, 47, 48, 178, 244,
                                  14, 175, 62, 228, 35, 203, 114, 91, 219, 59,
                                ],
                              ],
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
              {
                name: "mad",
                type: {
                  tuple: [
                    {
                      name: "list-mad",
                      type: {
                        list: {
                          length: 7,
                          type: {
                            tuple: [
                              {
                                name: "mad-inner",
                                type: {
                                  trait_reference: {
                                    name: "ft-trait",
                                    import: {
                                      Imported: {
                                        name: "sip-010-trait",
                                        contract_identifier: {
                                          name: "sip-010-trait-ft-standard",
                                          issuer: [
                                            22,
                                            [
                                              9, 159, 184, 137, 38, 216, 47, 48,
                                              178, 244, 14, 175, 62, 228, 35,
                                              203, 114, 91, 219, 59,
                                            ],
                                          ],
                                        },
                                      },
                                    },
                                  },
                                },
                              },
                            ],
                          },
                        },
                      },
                    },
                  ],
                },
              },
            ],
            outputs: {
              type: {
                response: {
                  ok: "bool",
                  error: "none",
                },
              },
            },
          },
        ],
      }),
    );

    // Act
    const actual = enrichInterfaceWithTraitData(
      ast,
      traitReferenceMap,
      allFunctionsInterfaces,
      targetContractId,
    );

    // Assert
    expect(actual).toEqual(expected);
  });

  it("correctly enriches interface with trait reference data for list-response and nested traits", () => {
    // Arrange
    const allFunctionsInterfaces = (
      testInputs.listResponseNestedTrait
        .functionsInterfaces as ContractInterfaceFunction[]
    ).filter((f) => f.name !== "update-context");

    const traitReferenceMap = buildTraitReferenceMap(allFunctionsInterfaces);

    const ast = testInputs.listResponseNestedTrait.ast as any as IContractAST;

    const targetContractId = "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.trait";

    const expected = new Map(
      Object.entries({
        [targetContractId]: [
          {
            name: "transfer",
            access: "private",
            args: [
              {
                name: "one-transfer",
                type: {
                  tuple: [
                    {
                      name: "amount",
                      type: "uint128",
                    },
                    {
                      name: "to",
                      type: "principal",
                    },
                    {
                      name: "token",
                      type: {
                        trait_reference: {
                          name: "ft-trait",
                          import: {
                            Imported: {
                              name: "sip-010-trait",
                              contract_identifier: {
                                name: "sip-010-trait-ft-standard",
                                issuer: [
                                  22,
                                  [
                                    9, 159, 184, 137, 38, 216, 47, 48, 178, 244,
                                    14, 175, 62, 228, 35, 203, 114, 91, 219, 59,
                                  ],
                                ],
                              },
                            },
                          },
                        },
                      },
                    },
                  ],
                },
              },
            ],
            outputs: {
              type: {
                response: {
                  error: "uint128",
                  ok: "bool",
                },
              },
            },
          },
          {
            name: "send-tokens",
            access: "public",
            args: [
              {
                name: "transfers",
                type: {
                  list: {
                    length: 5,
                    type: {
                      tuple: [
                        { name: "amount", type: "uint128" },
                        { name: "to", type: "principal" },
                        {
                          name: "token",
                          type: {
                            trait_reference: {
                              name: "ft-trait",
                              import: {
                                Imported: {
                                  name: "sip-010-trait",
                                  contract_identifier: {
                                    name: "sip-010-trait-ft-standard",
                                    issuer: [
                                      22,
                                      [
                                        9, 159, 184, 137, 38, 216, 47, 48, 178,
                                        244, 14, 175, 62, 228, 35, 203, 114, 91,
                                        219, 59,
                                      ],
                                    ],
                                  },
                                },
                              },
                            },
                          },
                        },
                      ],
                    },
                  },
                },
              },
            ],
            outputs: {
              type: {
                response: {
                  ok: {
                    list: {
                      length: 5,
                      type: { response: { ok: "bool", error: "uint128" } },
                    },
                  },
                  error: "none",
                },
              },
            },
          },
          {
            access: "public",
            args: [
              {
                name: "token-list",
                type: {
                  list: {
                    length: 5,
                    type: {
                      response: {
                        error: "uint128",
                        ok: {
                          trait_reference: {
                            import: {
                              Imported: {
                                contract_identifier: {
                                  issuer: [
                                    22,
                                    [
                                      9, 159, 184, 137, 38, 216, 47, 48, 178,
                                      244, 14, 175, 62, 228, 35, 203, 114, 91,
                                      219, 59,
                                    ],
                                  ],
                                  name: "sip-010-trait-ft-standard",
                                },
                                name: "sip-010-trait",
                              },
                            },
                            name: "ft-trait",
                          },
                        },
                      },
                    },
                  },
                },
              },
              {
                name: "to",
                type: "principal",
              },
              {
                name: "amount",
                type: "uint128",
              },
            ],
            name: "test-list-response",
            outputs: {
              type: {
                response: {
                  error: "none",
                  ok: "bool",
                },
              },
            },
          },
          {
            access: "read_only",
            args: [
              {
                name: "address",
                type: "principal",
              },
            ],
            name: "invariant-token-supply-vs-balance",
            outputs: {
              type: "bool",
            },
          },
        ],
      }),
    );

    // Act
    const actual = enrichInterfaceWithTraitData(
      ast,
      traitReferenceMap,
      allFunctionsInterfaces,
      targetContractId,
    );

    // Assert
    expect(actual).toEqual(expected);
  });

  it("correctly enriches interface with trait reference data for list-optional and nested traits", () => {
    // Arrange
    const allFunctionsInterfaces = (
      testInputs.listOptionalNestedTrait
        .functionsInterfaces as ContractInterfaceFunction[]
    ).filter((f) => f.name !== "update-context");

    const traitReferenceMap = buildTraitReferenceMap(allFunctionsInterfaces);

    const ast = testInputs.listOptionalNestedTrait.ast as any as IContractAST;

    const targetContractId = "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.trait";

    const expected = new Map(
      Object.entries({
        [targetContractId]: [
          {
            name: "transfer",
            access: "private",
            args: [
              {
                name: "one-transfer",
                type: {
                  tuple: [
                    {
                      name: "amount",
                      type: "uint128",
                    },
                    {
                      name: "to",
                      type: "principal",
                    },
                    {
                      name: "token",
                      type: {
                        trait_reference: {
                          name: "ft-trait",
                          import: {
                            Imported: {
                              name: "sip-010-trait",
                              contract_identifier: {
                                name: "sip-010-trait-ft-standard",
                                issuer: [
                                  22,
                                  [
                                    9, 159, 184, 137, 38, 216, 47, 48, 178, 244,
                                    14, 175, 62, 228, 35, 203, 114, 91, 219, 59,
                                  ],
                                ],
                              },
                            },
                          },
                        },
                      },
                    },
                  ],
                },
              },
            ],
            outputs: {
              type: {
                response: {
                  error: "uint128",
                  ok: "bool",
                },
              },
            },
          },
          {
            name: "send-tokens",
            access: "public",
            args: [
              {
                name: "transfers",
                type: {
                  list: {
                    length: 5,
                    type: {
                      tuple: [
                        { name: "amount", type: "uint128" },
                        { name: "to", type: "principal" },
                        {
                          name: "token",
                          type: {
                            trait_reference: {
                              name: "ft-trait",
                              import: {
                                Imported: {
                                  name: "sip-010-trait",
                                  contract_identifier: {
                                    name: "sip-010-trait-ft-standard",
                                    issuer: [
                                      22,
                                      [
                                        9, 159, 184, 137, 38, 216, 47, 48, 178,
                                        244, 14, 175, 62, 228, 35, 203, 114, 91,
                                        219, 59,
                                      ],
                                    ],
                                  },
                                },
                              },
                            },
                          },
                        },
                      ],
                    },
                  },
                },
              },
            ],
            outputs: {
              type: {
                response: {
                  ok: {
                    list: {
                      length: 5,
                      type: { response: { ok: "bool", error: "uint128" } },
                    },
                  },
                  error: "none",
                },
              },
            },
          },
          {
            access: "public",
            args: [
              {
                name: "token-list",
                type: {
                  list: {
                    length: 5,
                    type: {
                      optional: {
                        trait_reference: {
                          import: {
                            Imported: {
                              contract_identifier: {
                                issuer: [
                                  22,
                                  [
                                    9, 159, 184, 137, 38, 216, 47, 48, 178, 244,
                                    14, 175, 62, 228, 35, 203, 114, 91, 219, 59,
                                  ],
                                ],
                                name: "sip-010-trait-ft-standard",
                              },
                              name: "sip-010-trait",
                            },
                          },
                          name: "ft-trait",
                        },
                      },
                    },
                  },
                },
              },
              {
                name: "to",
                type: "principal",
              },
              {
                name: "amount",
                type: "uint128",
              },
            ],
            name: "test-list-response",
            outputs: {
              type: {
                response: {
                  error: "none",
                  ok: "bool",
                },
              },
            },
          },
          {
            access: "read_only",
            args: [
              {
                name: "address",
                type: "principal",
              },
            ],
            name: "invariant-token-supply-vs-balance",
            outputs: {
              type: "bool",
            },
          },
        ],
      }),
    );

    // Act
    const actual = enrichInterfaceWithTraitData(
      ast,
      traitReferenceMap,
      allFunctionsInterfaces,
      targetContractId,
    );

    // Assert
    expect(actual).toEqual(expected);
  });

  it("correctly retrieves the contracts implementing an imported trait from the Clarinet project", async () => {
    // Setup
    const tempDir = createIsolatedTestEnvironment(
      resolve(__dirname, "example"),
      isolatedTestEnvPrefix,
    );
    const simnet = await initSimnet(join(tempDir, "Clarinet.toml"));

    const projectTraitImplementations =
      extractProjectTraitImplementations(simnet);

    const traitData = {
      name: "ft-trait",
      import: {
        Imported: {
          name: "sip-010-trait",
          contract_identifier: {
            name: "sip-010-trait-ft-standard",
            issuer: [
              22,
              [
                9, 159, 184, 137, 38, 216, 47, 48, 178, 244, 14, 175, 62, 228,
                35, 203, 114, 91, 219, 59,
              ],
            ],
          },
        },
      },
    };

    const expected = new Set([
      "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.rendezvous-token",
      "SP4SZE494VC2YC5JYG7AYFQ44F5Q4PYV7DVMDPBG.ststx-token",
    ]);

    // Exercise
    const actual = new Set(
      getContractIdsImplementingTrait(traitData, projectTraitImplementations),
    );

    // Verify
    expect(actual).toEqual(expected);

    // Teardown
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("correctly retrieves empty array when no corresponding trait implementations are found", async () => {
    // Setup
    const tempDir = createIsolatedTestEnvironment(
      resolve(__dirname, "example"),
      isolatedTestEnvPrefix,
    );
    const simnet = await initSimnet(join(tempDir, "Clarinet.toml"));

    const projectTraitImplementations =
      extractProjectTraitImplementations(simnet);

    const traitImplementationData = {
      name: "in-contract-alias",
      import: {
        Imported: {
          name: "defined-name", // non-existent in the project.
          contract_identifier: {
            name: "contract-name", // non-existent in the project.
            issuer: [
              22,
              [
                9, 159, 184, 137, 38, 216, 47, 48, 178, 244, 14, 175, 62, 228,
                35, 203, 114, 91, 219, 59,
              ],
            ],
          },
        },
      },
    };

    // Exercise
    const actual = getContractIdsImplementingTrait(
      traitImplementationData,
      projectTraitImplementations,
    );

    // Verify
    expect(actual).toEqual([]);

    // Teardown
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("correctly retrieves the contracts implementing a defined trait from the Clarinet project", async () => {
    // Setup
    const tempDir = createIsolatedTestEnvironment(
      resolve(__dirname, "example"),
      isolatedTestEnvPrefix,
    );
    const simnet = await initSimnet(join(tempDir, "Clarinet.toml"));

    const projectTraitImplementations =
      extractProjectTraitImplementations(simnet);

    const traitData = {
      name: "ft-trait",
      import: {
        Defined: {
          name: "sip-010-trait",
          contract_identifier: {
            name: "sip-010-trait-ft-standard",
            issuer: [
              22,
              [
                9, 159, 184, 137, 38, 216, 47, 48, 178, 244, 14, 175, 62, 228,
                35, 203, 114, 91, 219, 59,
              ],
            ],
          },
        },
      },
    };

    const expected = new Set([
      "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.rendezvous-token",
      "SP4SZE494VC2YC5JYG7AYFQ44F5Q4PYV7DVMDPBG.ststx-token",
    ]);

    // Exercise
    const actual = new Set(
      getContractIdsImplementingTrait(traitData, projectTraitImplementations),
    );

    // Verify
    expect(actual).toEqual(expected);

    // Teardown
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("enriches private test functions with trait reference data so their arguments can be generated", async () => {
    // Setup
    const tempDir = createIsolatedTestEnvironment(
      resolve(__dirname, "example"),
      isolatedTestEnvPrefix,
    );
    const simnet = await initSimnet(join(tempDir, "Clarinet.toml"));

    const contractId = `${simnet.deployer}.send-tokens`;
    const testFunctions = simnet
      .getContractsInterfaces()
      .get(contractId)!
      .functions.filter(
        (f) => f.access === "private" && f.name.startsWith("test-"),
      );
    const traitReferenceMap = buildTraitReferenceMap(testFunctions);

    // Exercise
    const enriched = enrichInterfaceWithTraitData(
      simnet.getContractAST("send-tokens"),
      traitReferenceMap,
      testFunctions,
      contractId,
    );
    const testTransfer = enriched
      .get(contractId)!
      .find((f) => f.name === "test-transfer")!;

    // Verify
    expect(testTransfer.args[0].type).toEqual({
      trait_reference: expect.objectContaining({ name: "ft-trait" }),
    });
    const [[token]] = fc.sample(strategyFor(simnet, testTransfer), 1);
    expect(token).toEqual(
      expect.objectContaining({ type: "contract", value: expect.any(String) }),
    );

    // Teardown
    rmSync(tempDir, { recursive: true, force: true });
  });
});

describe("Trait reference detection", () => {
  it("returns false when no arguments contain a trait reference", async () => {
    // Arrange
    const noTraitFunction = {
      name: "function-without-traits",
      access: "public",
      args: [
        { name: "arg1", type: "uint128" },
        { name: "arg2", type: { buffer: { length: 10 } } },
        { name: "arg3", type: { "string-ascii": { length: 20 } } },
        { name: "arg4", type: "principal" },
        { name: "arg5", type: "bool" },
        { name: "arg6", type: "int128" },
      ],
      outputs: {
        type: {
          response: {
            ok: "bool",
            error: "uint128",
          },
        },
      },
    } as ContractInterfaceFunction;

    // Act
    const actual = isTraitReferenceFunction(noTraitFunction);

    // Assert
    expect(actual).toBe(false);
  });

  it("returns true when an argument contains a trait reference", async () => {
    // Arrange
    const traitFunction = {
      name: "function-with-traits",
      access: "public",
      args: [
        { name: "arg1", type: "trait_reference" },
        { name: "arg2", type: "uint128" },
      ],
      outputs: {
        type: {
          response: {
            ok: "bool",
            error: "uint128",
          },
        },
      },
    } as ContractInterfaceFunction;

    // Act
    const actual = isTraitReferenceFunction(traitFunction);

    // Assert
    expect(actual).toBe(true);
  });

  it("returns false for a list argument without traits", async () => {
    // Arrange
    const listFunction = {
      name: "list-without-traits",
      access: "public",
      args: [
        {
          name: "listArg",
          type: { list: { type: "uint128", length: 5 } },
        },
      ],
      outputs: {
        type: {
          response: {
            ok: "bool",
            error: "uint128",
          },
        },
      },
    } as ContractInterfaceFunction;

    // Act
    const actual = isTraitReferenceFunction(listFunction);

    // Assert
    expect(actual).toBe(false);
  });

  it("returns true for a list argument with traits", async () => {
    // Arrange
    const listWithTraitFunction = {
      name: "list-with-traits",
      access: "public",
      args: [
        {
          name: "listArg",
          type: { list: { type: "trait_reference", length: 5 } },
        },
      ],
      outputs: {
        type: {
          response: {
            ok: "bool",
            error: "uint128",
          },
        },
      },
    } as ContractInterfaceFunction;

    // Act
    const actual = isTraitReferenceFunction(listWithTraitFunction);

    // Assert
    expect(actual).toBe(true);
  });

  it("returns false for a tuple argument without traits", async () => {
    // Arrange
    const tupleFunction = {
      name: "tuple-without-traits",
      access: "public",
      args: [
        {
          name: "tupleArg",
          type: {
            tuple: [
              { name: "field1", type: "uint128" },
              { name: "field2", type: { buffer: { length: 10 } } },
            ],
          },
        },
      ],
      outputs: {
        type: {
          response: {
            ok: "bool",
            error: "uint128",
          },
        },
      },
    } as ContractInterfaceFunction;

    // Act
    const actual = isTraitReferenceFunction(tupleFunction);

    // Assert
    expect(actual).toBe(false);
  });

  it("returns true for a tuple argument with traits", async () => {
    // Arrange
    const tupleWithTraitFunction = {
      name: "tuple-with-traits",
      access: "public",
      args: [
        {
          name: "tupleArg",
          type: {
            tuple: [
              { name: "field1", type: "uint128" },
              { name: "field2", type: "trait_reference" },
            ],
          },
        },
      ],
      outputs: {
        type: {
          response: {
            ok: "bool",
            error: "uint128",
          },
        },
      },
    } as ContractInterfaceFunction;

    // Act
    const actual = isTraitReferenceFunction(tupleWithTraitFunction);

    // Assert
    expect(actual).toBe(true);
  });

  it("returns false for an optional argument without traits", async () => {
    // Arrange
    const optionalFunction = {
      name: "optional-without-traits",
      access: "public",
      args: [{ name: "optionalArg", type: { optional: "uint128" } }],
      outputs: {
        type: {
          response: {
            ok: "bool",
            error: "uint128",
          },
        },
      },
    } as ContractInterfaceFunction;

    // Act
    const actual = isTraitReferenceFunction(optionalFunction);

    // Assert
    expect(actual).toBe(false);
  });

  it("returns true for an optional argument with traits", async () => {
    // Arrange
    const optionalWithTraitFunction = {
      name: "optional-with-traits",
      access: "public",
      args: [{ name: "optionalArg", type: { optional: "trait_reference" } }],
      outputs: {
        type: {
          response: {
            ok: "bool",
            error: "uint128",
          },
        },
      },
    } as ContractInterfaceFunction;

    // Act
    const actual = isTraitReferenceFunction(optionalWithTraitFunction);

    // Assert
    expect(actual).toBe(true);
  });

  it("returns false for a response argument without traits", async () => {
    // Arrange
    const responseFunction = {
      name: "response-without-traits",
      access: "public",
      args: [
        {
          name: "responseArg",
          type: {
            response: { ok: "uint128", error: "bool" },
          },
        },
      ],
      outputs: {
        type: {
          response: {
            ok: "bool",
            error: "uint128",
          },
        },
      },
    } as ContractInterfaceFunction;

    // Act
    const actual = isTraitReferenceFunction(responseFunction);

    // Assert
    expect(actual).toBe(false);
  });

  it("returns true for a response argument with traits", async () => {
    // Arrange
    const responseWithTraitFunction = {
      name: "response-with-traits",
      access: "public",
      args: [
        {
          name: "responseArg",
          type: {
            response: { ok: "trait_reference", error: "uint128" },
          },
        },
      ],
      outputs: {
        type: {
          response: {
            ok: "bool",
            error: "uint128",
          },
        },
      },
    } as ContractInterfaceFunction;

    // Act
    const actual = isTraitReferenceFunction(responseWithTraitFunction);

    // Assert
    expect(actual).toBe(true);
  });

  it("returns false for unexpected argument types", async () => {
    // Arrange
    const unexpectedTypeFunction = {
      name: "unexpected-type-function",
      access: "public",
      args: [{ name: "unexpectedArg", type: "custom_type" as any }],
      outputs: {
        type: {
          response: {
            ok: "bool",
            error: "uint128",
          },
        },
      },
    } as ContractInterfaceFunction;

    // Act
    const actual = isTraitReferenceFunction(unexpectedTypeFunction);

    // Assert
    expect(actual).toBe(false);
  });

  it("returns false for an argument with an unrecognized complex type", async () => {
    // Arrange
    const unrecognizedTypeFunction = {
      name: "unrecognized-type-function",
      access: "public",
      args: [{ name: "unknownArg", type: { unknown: "some_value" } as any }],
      outputs: { type: "bool" },
    } as ContractInterfaceFunction;

    // Act
    const actual = isTraitReferenceFunction(unrecognizedTypeFunction);

    // Assert
    expect(actual).toBe(false);
  });
});

describe("Non-testable trait function filtering", () => {
  it("returns correct function names when no corresponding trait implementations", () => {
    // Arrange
    const contractId =
      "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.test-contract";

    // Mock function interfaces enriched with trait data.
    const enrichedFunctionsInterfaces = new Map([
      [
        contractId,
        [
          {
            name: "function-with-direct-trait",
            access: "public",
            args: [
              {
                name: "token",
                type: {
                  trait_reference: {
                    name: "in-contract-alias",
                    import: {
                      Imported: {
                        name: "defined-name",
                        contract_identifier: {
                          name: "contract-name",
                          issuer: [
                            22,
                            [
                              9, 159, 184, 137, 38, 216, 47, 48, 178, 244, 14,
                              175, 62, 228, 35, 203, 114, 91, 219, 59,
                            ],
                          ],
                        },
                      },
                    },
                  },
                },
              },
            ],
            outputs: {
              type: {
                response: {
                  ok: "bool",
                  error: "uint128",
                },
              },
            },
          },
          {
            name: "function-with-list-nested-trait",
            access: "public",
            args: [
              {
                name: "token-list",
                type: {
                  list: {
                    type: {
                      trait_reference: {
                        name: "in-contract-alias",
                        import: {
                          Imported: {
                            name: "defined-name",
                            contract_identifier: {
                              name: "contract-name",
                              issuer: [
                                22,
                                [
                                  9, 159, 184, 137, 38, 216, 47, 48, 178, 244,
                                  14, 175, 62, 228, 35, 203, 114, 91, 219, 59,
                                ],
                              ],
                            },
                          },
                        },
                      },
                    },
                    length: 5,
                  },
                },
              },
            ],
            outputs: {
              type: {
                response: {
                  ok: "bool",
                  error: "none",
                },
              },
            },
          },
          {
            name: "function-without-traits",
            access: "public",
            args: [
              { name: "amount", type: "uint128" },
              { name: "recipient", type: "principal" },
            ],
            outputs: {
              type: {
                response: {
                  ok: "bool",
                  error: "uint128",
                },
              },
            },
          },
        ] as EnrichedContractInterfaceFunction[],
      ],
    ]);

    // Mock trait reference map. These are the function names mapped to the
    // trait reference nesting path in the parameter.
    const traitReferenceMap = new Map([
      ["function-with-direct-trait", { token: "trait_reference" }],
      ["function-with-list-nested-trait", { tokens: "trait_reference" }],
    ]);

    // The project does not contain explicit trait implementations.
    const projectTraitImplementations: Record<string, ImplementedTraitType[]> =
      {};

    // The non-testable function is the one whose parameters accept trait
    // implementations since the project has no explicit trait implementation
    // contracts.
    const expected = [
      "function-with-direct-trait",
      "function-with-list-nested-trait",
    ];

    // Act
    const actual = getNonTestableTraitFunctions(
      enrichedFunctionsInterfaces,
      traitReferenceMap,
      projectTraitImplementations,
      contractId,
    );

    // Assert
    expect(actual).toEqual(expected);
  });
});

const testInputs = {
  directImportedTrait1stParameter: {
    functionsInterfaces: [
      {
        name: "function",
        access: "public",
        args: [],
        outputs: {
          type: {
            response: {
              ok: "bool",
              error: "none",
            },
          },
        },
      },
      {
        name: "test-no-trait",
        access: "public",
        args: [],
        outputs: {
          type: {
            response: {
              ok: "bool",
              error: "none",
            },
          },
        },
      },
      {
        name: "test-trait",
        access: "public",
        args: [
          {
            name: "token",
            type: "trait_reference",
          },
        ],
        outputs: {
          type: {
            response: {
              ok: "bool",
              error: "none",
            },
          },
        },
      },
      {
        name: "update-context",
        access: "public",
        args: [
          {
            name: "function-name",
            type: {
              "string-ascii": {
                length: 100,
              },
            },
          },
          {
            name: "called",
            type: "uint128",
          },
        ],
        outputs: {
          type: {
            response: {
              ok: "bool",
              error: "none",
            },
          },
        },
      },
    ],
    ast: {
      contract_identifier: {
        issuer: [
          26,
          [
            109, 120, 222, 123, 6, 37, 223, 191, 193, 108, 58, 138, 87, 53, 246,
            220, 61, 195, 242, 206,
          ],
        ],
        name: "trait-contract",
      },
      pre_expressions: [],
      expressions: [
        {
          expr: {
            List: [
              {
                expr: {
                  Atom: "use-trait",
                },
                id: 2,
                span: {
                  start_line: 1,
                  start_column: 2,
                  end_line: 1,
                  end_column: 10,
                },
              },
              {
                expr: {
                  Atom: "ft-trait",
                },
                id: 3,
                span: {
                  start_line: 1,
                  start_column: 12,
                  end_line: 1,
                  end_column: 19,
                },
              },
              {
                expr: {
                  Field: {
                    name: "sip-010-trait",
                    contract_identifier: {
                      issuer: [
                        22,
                        [
                          9, 159, 184, 137, 38, 216, 47, 48, 178, 244, 14, 175,
                          62, 228, 35, 203, 114, 91, 219, 59,
                        ],
                      ],
                      name: "sip-010-trait-ft-standard",
                    },
                  },
                },
                id: 4,
                span: {
                  start_line: 1,
                  start_column: 21,
                  end_line: 1,
                  end_column: 101,
                },
              },
            ],
          },
          id: 1,
          span: {
            start_line: 1,
            start_column: 1,
            end_line: 1,
            end_column: 102,
          },
        },
        {
          expr: {
            List: [
              {
                expr: {
                  Atom: "define-public",
                },
                id: 6,
                span: {
                  start_line: 3,
                  start_column: 2,
                  end_line: 3,
                  end_column: 14,
                },
              },
              {
                expr: {
                  List: [
                    {
                      expr: {
                        Atom: "trait-transfer-function",
                      },
                      id: 8,
                      span: {
                        start_line: 3,
                        start_column: 17,
                        end_line: 3,
                        end_column: 39,
                      },
                    },
                    {
                      expr: {
                        List: [
                          {
                            expr: {
                              Atom: "token",
                            },
                            id: 10,
                            span: {
                              start_line: 3,
                              start_column: 42,
                              end_line: 3,
                              end_column: 46,
                            },
                          },
                          {
                            expr: {
                              TraitReference: [
                                "ft-trait",
                                {
                                  Imported: {
                                    name: "sip-010-trait",
                                    contract_identifier: {
                                      issuer: [
                                        22,
                                        [
                                          9, 159, 184, 137, 38, 216, 47, 48,
                                          178, 244, 14, 175, 62, 228, 35, 203,
                                          114, 91, 219, 59,
                                        ],
                                      ],
                                      name: "sip-010-trait-ft-standard",
                                    },
                                  },
                                },
                              ],
                            },
                            id: 11,
                            span: {
                              start_line: 3,
                              start_column: 48,
                              end_line: 3,
                              end_column: 57,
                            },
                          },
                        ],
                      },
                      id: 9,
                      span: {
                        start_line: 3,
                        start_column: 41,
                        end_line: 3,
                        end_column: 58,
                      },
                    },
                  ],
                },
                id: 7,
                span: {
                  start_line: 3,
                  start_column: 16,
                  end_line: 3,
                  end_column: 59,
                },
              },
              {
                expr: {
                  List: [
                    {
                      expr: {
                        Atom: "ok",
                      },
                      id: 13,
                      span: {
                        start_line: 4,
                        start_column: 4,
                        end_line: 4,
                        end_column: 5,
                      },
                    },
                    {
                      expr: {
                        Atom: "true",
                      },
                      id: 14,
                      span: {
                        start_line: 4,
                        start_column: 7,
                        end_line: 4,
                        end_column: 10,
                      },
                    },
                  ],
                },
                id: 12,
                span: {
                  start_line: 4,
                  start_column: 3,
                  end_line: 4,
                  end_column: 11,
                },
              },
            ],
          },
          id: 5,
          span: {
            start_line: 3,
            start_column: 1,
            end_line: 5,
            end_column: 1,
          },
        },
        {
          expr: {
            List: [
              {
                expr: {
                  Atom: "define-map",
                },
                id: 16,
                span: {
                  start_line: 8,
                  start_column: 2,
                  end_line: 8,
                  end_column: 11,
                },
              },
              {
                expr: {
                  Atom: "context",
                },
                id: 17,
                span: {
                  start_line: 8,
                  start_column: 13,
                  end_line: 8,
                  end_column: 19,
                },
              },
              {
                expr: {
                  List: [
                    {
                      expr: {
                        Atom: "string-ascii",
                      },
                      id: 19,
                      span: {
                        start_line: 8,
                        start_column: 22,
                        end_line: 8,
                        end_column: 33,
                      },
                    },
                    {
                      expr: {
                        LiteralValue: {
                          Int: "100",
                        },
                      },
                      id: 20,
                      span: {
                        start_line: 8,
                        start_column: 35,
                        end_line: 8,
                        end_column: 37,
                      },
                    },
                  ],
                },
                id: 18,
                span: {
                  start_line: 8,
                  start_column: 21,
                  end_line: 8,
                  end_column: 38,
                },
              },
              {
                expr: {
                  List: [
                    {
                      expr: {
                        Atom: "tuple",
                      },
                      id: 22,
                      span: {
                        start_line: 0,
                        start_column: 0,
                        end_line: 0,
                        end_column: 0,
                      },
                    },
                    {
                      expr: {
                        List: [
                          {
                            expr: {
                              Atom: "called",
                            },
                            id: 24,
                            span: {
                              start_line: 9,
                              start_column: 5,
                              end_line: 9,
                              end_column: 10,
                            },
                          },
                          {
                            expr: {
                              Atom: "uint",
                            },
                            id: 25,
                            span: {
                              start_line: 9,
                              start_column: 13,
                              end_line: 9,
                              end_column: 16,
                            },
                            post_comments: [
                              [
                                "other data",
                                {
                                  start_line: 10,
                                  start_column: 5,
                                  end_line: 10,
                                  end_column: 17,
                                },
                              ],
                            ],
                          },
                        ],
                      },
                      id: 23,
                      span: {
                        start_line: 9,
                        start_column: 5,
                        end_line: 9,
                        end_column: 16,
                      },
                    },
                  ],
                },
                id: 21,
                span: {
                  start_line: 8,
                  start_column: 40,
                  end_line: 11,
                  end_column: 3,
                },
              },
            ],
          },
          id: 15,
          span: {
            start_line: 8,
            start_column: 1,
            end_line: 11,
            end_column: 4,
          },
        },
        {
          expr: {
            List: [
              {
                expr: {
                  Atom: "define-public",
                },
                id: 27,
                span: {
                  start_line: 13,
                  start_column: 4,
                  end_line: 13,
                  end_column: 16,
                },
              },
              {
                expr: {
                  List: [
                    {
                      expr: {
                        Atom: "update-context",
                      },
                      id: 29,
                      span: {
                        start_line: 13,
                        start_column: 19,
                        end_line: 13,
                        end_column: 32,
                      },
                    },
                    {
                      expr: {
                        List: [
                          {
                            expr: {
                              Atom: "function-name",
                            },
                            id: 31,
                            span: {
                              start_line: 13,
                              start_column: 35,
                              end_line: 13,
                              end_column: 47,
                            },
                          },
                          {
                            expr: {
                              List: [
                                {
                                  expr: {
                                    Atom: "string-ascii",
                                  },
                                  id: 33,
                                  span: {
                                    start_line: 13,
                                    start_column: 50,
                                    end_line: 13,
                                    end_column: 61,
                                  },
                                },
                                {
                                  expr: {
                                    LiteralValue: {
                                      Int: "100",
                                    },
                                  },
                                  id: 34,
                                  span: {
                                    start_line: 13,
                                    start_column: 63,
                                    end_line: 13,
                                    end_column: 65,
                                  },
                                },
                              ],
                            },
                            id: 32,
                            span: {
                              start_line: 13,
                              start_column: 49,
                              end_line: 13,
                              end_column: 66,
                            },
                          },
                        ],
                      },
                      id: 30,
                      span: {
                        start_line: 13,
                        start_column: 34,
                        end_line: 13,
                        end_column: 67,
                      },
                    },
                    {
                      expr: {
                        List: [
                          {
                            expr: {
                              Atom: "called",
                            },
                            id: 36,
                            span: {
                              start_line: 13,
                              start_column: 70,
                              end_line: 13,
                              end_column: 75,
                            },
                          },
                          {
                            expr: {
                              Atom: "uint",
                            },
                            id: 37,
                            span: {
                              start_line: 13,
                              start_column: 77,
                              end_line: 13,
                              end_column: 80,
                            },
                          },
                        ],
                      },
                      id: 35,
                      span: {
                        start_line: 13,
                        start_column: 69,
                        end_line: 13,
                        end_column: 81,
                      },
                    },
                  ],
                },
                id: 28,
                span: {
                  start_line: 13,
                  start_column: 18,
                  end_line: 13,
                  end_column: 82,
                },
              },
              {
                expr: {
                  List: [
                    {
                      expr: {
                        Atom: "ok",
                      },
                      id: 39,
                      span: {
                        start_line: 14,
                        start_column: 6,
                        end_line: 14,
                        end_column: 7,
                      },
                    },
                    {
                      expr: {
                        List: [
                          {
                            expr: {
                              Atom: "map-set",
                            },
                            id: 41,
                            span: {
                              start_line: 14,
                              start_column: 10,
                              end_line: 14,
                              end_column: 16,
                            },
                          },
                          {
                            expr: {
                              Atom: "context",
                            },
                            id: 42,
                            span: {
                              start_line: 14,
                              start_column: 18,
                              end_line: 14,
                              end_column: 24,
                            },
                          },
                          {
                            expr: {
                              Atom: "function-name",
                            },
                            id: 43,
                            span: {
                              start_line: 14,
                              start_column: 26,
                              end_line: 14,
                              end_column: 38,
                            },
                          },
                          {
                            expr: {
                              List: [
                                {
                                  expr: {
                                    Atom: "tuple",
                                  },
                                  id: 45,
                                  span: {
                                    start_line: 0,
                                    start_column: 0,
                                    end_line: 0,
                                    end_column: 0,
                                  },
                                },
                                {
                                  expr: {
                                    List: [
                                      {
                                        expr: {
                                          Atom: "called",
                                        },
                                        id: 47,
                                        span: {
                                          start_line: 14,
                                          start_column: 41,
                                          end_line: 14,
                                          end_column: 46,
                                        },
                                      },
                                      {
                                        expr: {
                                          Atom: "called",
                                        },
                                        id: 48,
                                        span: {
                                          start_line: 14,
                                          start_column: 49,
                                          end_line: 14,
                                          end_column: 54,
                                        },
                                      },
                                    ],
                                  },
                                  id: 46,
                                  span: {
                                    start_line: 14,
                                    start_column: 41,
                                    end_line: 14,
                                    end_column: 54,
                                  },
                                },
                              ],
                            },
                            id: 44,
                            span: {
                              start_line: 14,
                              start_column: 40,
                              end_line: 14,
                              end_column: 55,
                            },
                          },
                        ],
                      },
                      id: 40,
                      span: {
                        start_line: 14,
                        start_column: 9,
                        end_line: 14,
                        end_column: 56,
                      },
                    },
                  ],
                },
                id: 38,
                span: {
                  start_line: 14,
                  start_column: 5,
                  end_line: 14,
                  end_column: 57,
                },
              },
            ],
          },
          id: 26,
          span: {
            start_line: 13,
            start_column: 3,
            end_line: 14,
            end_column: 58,
          },
        },
        {
          expr: {
            List: [
              {
                expr: {
                  Atom: "define-public",
                },
                id: 50,
                span: {
                  start_line: 16,
                  start_column: 2,
                  end_line: 16,
                  end_column: 14,
                },
              },
              {
                expr: {
                  List: [
                    {
                      expr: {
                        Atom: "test-no-trait",
                      },
                      id: 52,
                      span: {
                        start_line: 16,
                        start_column: 17,
                        end_line: 16,
                        end_column: 29,
                      },
                    },
                  ],
                },
                id: 51,
                span: {
                  start_line: 16,
                  start_column: 16,
                  end_line: 16,
                  end_column: 30,
                },
              },
              {
                expr: {
                  List: [
                    {
                      expr: {
                        Atom: "ok",
                      },
                      id: 54,
                      span: {
                        start_line: 17,
                        start_column: 4,
                        end_line: 17,
                        end_column: 5,
                      },
                    },
                    {
                      expr: {
                        Atom: "true",
                      },
                      id: 55,
                      span: {
                        start_line: 17,
                        start_column: 7,
                        end_line: 17,
                        end_column: 10,
                      },
                    },
                  ],
                },
                id: 53,
                span: {
                  start_line: 17,
                  start_column: 3,
                  end_line: 17,
                  end_column: 11,
                },
              },
            ],
          },
          id: 49,
          span: {
            start_line: 16,
            start_column: 1,
            end_line: 18,
            end_column: 1,
          },
        },
        {
          expr: {
            List: [
              {
                expr: {
                  Atom: "define-public",
                },
                id: 57,
                span: {
                  start_line: 20,
                  start_column: 2,
                  end_line: 20,
                  end_column: 14,
                },
              },
              {
                expr: {
                  List: [
                    {
                      expr: {
                        Atom: "test-trait",
                      },
                      id: 59,
                      span: {
                        start_line: 20,
                        start_column: 17,
                        end_line: 20,
                        end_column: 26,
                      },
                    },
                    {
                      expr: {
                        List: [
                          {
                            expr: {
                              Atom: "token",
                            },
                            id: 61,
                            span: {
                              start_line: 20,
                              start_column: 29,
                              end_line: 20,
                              end_column: 33,
                            },
                          },
                          {
                            expr: {
                              TraitReference: [
                                "ft-trait",
                                {
                                  Imported: {
                                    name: "sip-010-trait",
                                    contract_identifier: {
                                      issuer: [
                                        22,
                                        [
                                          9, 159, 184, 137, 38, 216, 47, 48,
                                          178, 244, 14, 175, 62, 228, 35, 203,
                                          114, 91, 219, 59,
                                        ],
                                      ],
                                      name: "sip-010-trait-ft-standard",
                                    },
                                  },
                                },
                              ],
                            },
                            id: 62,
                            span: {
                              start_line: 20,
                              start_column: 35,
                              end_line: 20,
                              end_column: 44,
                            },
                          },
                        ],
                      },
                      id: 60,
                      span: {
                        start_line: 20,
                        start_column: 28,
                        end_line: 20,
                        end_column: 45,
                      },
                    },
                  ],
                },
                id: 58,
                span: {
                  start_line: 20,
                  start_column: 16,
                  end_line: 20,
                  end_column: 46,
                },
              },
              {
                expr: {
                  List: [
                    {
                      expr: {
                        Atom: "ok",
                      },
                      id: 64,
                      span: {
                        start_line: 21,
                        start_column: 4,
                        end_line: 21,
                        end_column: 5,
                      },
                    },
                    {
                      expr: {
                        Atom: "true",
                      },
                      id: 65,
                      span: {
                        start_line: 21,
                        start_column: 7,
                        end_line: 21,
                        end_column: 10,
                      },
                    },
                  ],
                },
                id: 63,
                span: {
                  start_line: 21,
                  start_column: 3,
                  end_line: 21,
                  end_column: 11,
                },
              },
            ],
          },
          id: 56,
          span: {
            start_line: 20,
            start_column: 1,
            end_line: 22,
            end_column: 1,
          },
        },
      ],
      top_level_expression_sorting: [0, 1, 2, 3, 4, 5],
      referenced_traits: {},
      implemented_traits: [],
    },
  },
  directDefinedTrait1stParameter: {
    functionsInterfaces: [
      {
        name: "function",
        access: "public",
        args: [],
        outputs: {
          type: {
            response: {
              ok: "bool",
              error: "none",
            },
          },
        },
      },
      {
        name: "test-no-trait",
        access: "public",
        args: [],
        outputs: {
          type: {
            response: {
              ok: "bool",
              error: "none",
            },
          },
        },
      },
      {
        name: "test-trait",
        access: "public",
        args: [
          {
            name: "token",
            type: "trait_reference",
          },
        ],
        outputs: {
          type: {
            response: {
              ok: "bool",
              error: "none",
            },
          },
        },
      },
      {
        name: "update-context",
        access: "public",
        args: [
          {
            name: "function-name",
            type: {
              "string-ascii": {
                length: 100,
              },
            },
          },
          {
            name: "called",
            type: "uint128",
          },
        ],
        outputs: {
          type: {
            response: {
              ok: "bool",
              error: "none",
            },
          },
        },
      },
    ],
    ast: {
      contract_identifier: {
        issuer: [
          26,
          [
            109, 120, 222, 123, 6, 37, 223, 191, 193, 108, 58, 138, 87, 53, 246,
            220, 61, 195, 242, 206,
          ],
        ],
        name: "trait-contract",
      },
      pre_expressions: [],
      expressions: [
        {
          expr: {
            List: [
              {
                expr: {
                  Atom: "use-trait",
                },
                id: 2,
                span: {
                  start_line: 1,
                  start_column: 2,
                  end_line: 1,
                  end_column: 10,
                },
              },
              {
                expr: {
                  Atom: "ft-trait",
                },
                id: 3,
                span: {
                  start_line: 1,
                  start_column: 12,
                  end_line: 1,
                  end_column: 19,
                },
              },
              {
                expr: {
                  Field: {
                    name: "sip-010-trait",
                    contract_identifier: {
                      issuer: [
                        22,
                        [
                          9, 159, 184, 137, 38, 216, 47, 48, 178, 244, 14, 175,
                          62, 228, 35, 203, 114, 91, 219, 59,
                        ],
                      ],
                      name: "sip-010-trait-ft-standard",
                    },
                  },
                },
                id: 4,
                span: {
                  start_line: 1,
                  start_column: 21,
                  end_line: 1,
                  end_column: 101,
                },
              },
            ],
          },
          id: 1,
          span: {
            start_line: 1,
            start_column: 1,
            end_line: 1,
            end_column: 102,
          },
        },
        {
          expr: {
            List: [
              {
                expr: {
                  Atom: "define-public",
                },
                id: 6,
                span: {
                  start_line: 3,
                  start_column: 2,
                  end_line: 3,
                  end_column: 14,
                },
              },
              {
                expr: {
                  List: [
                    {
                      expr: {
                        Atom: "trait-transfer-function",
                      },
                      id: 8,
                      span: {
                        start_line: 3,
                        start_column: 17,
                        end_line: 3,
                        end_column: 39,
                      },
                    },
                    {
                      expr: {
                        List: [
                          {
                            expr: {
                              Atom: "token",
                            },
                            id: 10,
                            span: {
                              start_line: 3,
                              start_column: 42,
                              end_line: 3,
                              end_column: 46,
                            },
                          },
                          {
                            expr: {
                              TraitReference: [
                                "ft-trait",
                                {
                                  Defined: {
                                    name: "sip-010-trait",
                                    contract_identifier: {
                                      issuer: [
                                        22,
                                        [
                                          9, 159, 184, 137, 38, 216, 47, 48,
                                          178, 244, 14, 175, 62, 228, 35, 203,
                                          114, 91, 219, 59,
                                        ],
                                      ],
                                      name: "sip-010-trait-ft-standard",
                                    },
                                  },
                                },
                              ],
                            },
                            id: 11,
                            span: {
                              start_line: 3,
                              start_column: 48,
                              end_line: 3,
                              end_column: 57,
                            },
                          },
                        ],
                      },
                      id: 9,
                      span: {
                        start_line: 3,
                        start_column: 41,
                        end_line: 3,
                        end_column: 58,
                      },
                    },
                  ],
                },
                id: 7,
                span: {
                  start_line: 3,
                  start_column: 16,
                  end_line: 3,
                  end_column: 59,
                },
              },
              {
                expr: {
                  List: [
                    {
                      expr: {
                        Atom: "ok",
                      },
                      id: 13,
                      span: {
                        start_line: 4,
                        start_column: 4,
                        end_line: 4,
                        end_column: 5,
                      },
                    },
                    {
                      expr: {
                        Atom: "true",
                      },
                      id: 14,
                      span: {
                        start_line: 4,
                        start_column: 7,
                        end_line: 4,
                        end_column: 10,
                      },
                    },
                  ],
                },
                id: 12,
                span: {
                  start_line: 4,
                  start_column: 3,
                  end_line: 4,
                  end_column: 11,
                },
              },
            ],
          },
          id: 5,
          span: {
            start_line: 3,
            start_column: 1,
            end_line: 5,
            end_column: 1,
          },
        },
        {
          expr: {
            List: [
              {
                expr: {
                  Atom: "define-map",
                },
                id: 16,
                span: {
                  start_line: 8,
                  start_column: 2,
                  end_line: 8,
                  end_column: 11,
                },
              },
              {
                expr: {
                  Atom: "context",
                },
                id: 17,
                span: {
                  start_line: 8,
                  start_column: 13,
                  end_line: 8,
                  end_column: 19,
                },
              },
              {
                expr: {
                  List: [
                    {
                      expr: {
                        Atom: "string-ascii",
                      },
                      id: 19,
                      span: {
                        start_line: 8,
                        start_column: 22,
                        end_line: 8,
                        end_column: 33,
                      },
                    },
                    {
                      expr: {
                        LiteralValue: {
                          Int: "100",
                        },
                      },
                      id: 20,
                      span: {
                        start_line: 8,
                        start_column: 35,
                        end_line: 8,
                        end_column: 37,
                      },
                    },
                  ],
                },
                id: 18,
                span: {
                  start_line: 8,
                  start_column: 21,
                  end_line: 8,
                  end_column: 38,
                },
              },
              {
                expr: {
                  List: [
                    {
                      expr: {
                        Atom: "tuple",
                      },
                      id: 22,
                      span: {
                        start_line: 0,
                        start_column: 0,
                        end_line: 0,
                        end_column: 0,
                      },
                    },
                    {
                      expr: {
                        List: [
                          {
                            expr: {
                              Atom: "called",
                            },
                            id: 24,
                            span: {
                              start_line: 9,
                              start_column: 5,
                              end_line: 9,
                              end_column: 10,
                            },
                          },
                          {
                            expr: {
                              Atom: "uint",
                            },
                            id: 25,
                            span: {
                              start_line: 9,
                              start_column: 13,
                              end_line: 9,
                              end_column: 16,
                            },
                            post_comments: [
                              [
                                "other data",
                                {
                                  start_line: 10,
                                  start_column: 5,
                                  end_line: 10,
                                  end_column: 17,
                                },
                              ],
                            ],
                          },
                        ],
                      },
                      id: 23,
                      span: {
                        start_line: 9,
                        start_column: 5,
                        end_line: 9,
                        end_column: 16,
                      },
                    },
                  ],
                },
                id: 21,
                span: {
                  start_line: 8,
                  start_column: 40,
                  end_line: 11,
                  end_column: 3,
                },
              },
            ],
          },
          id: 15,
          span: {
            start_line: 8,
            start_column: 1,
            end_line: 11,
            end_column: 4,
          },
        },
        {
          expr: {
            List: [
              {
                expr: {
                  Atom: "define-public",
                },
                id: 27,
                span: {
                  start_line: 13,
                  start_column: 4,
                  end_line: 13,
                  end_column: 16,
                },
              },
              {
                expr: {
                  List: [
                    {
                      expr: {
                        Atom: "update-context",
                      },
                      id: 29,
                      span: {
                        start_line: 13,
                        start_column: 19,
                        end_line: 13,
                        end_column: 32,
                      },
                    },
                    {
                      expr: {
                        List: [
                          {
                            expr: {
                              Atom: "function-name",
                            },
                            id: 31,
                            span: {
                              start_line: 13,
                              start_column: 35,
                              end_line: 13,
                              end_column: 47,
                            },
                          },
                          {
                            expr: {
                              List: [
                                {
                                  expr: {
                                    Atom: "string-ascii",
                                  },
                                  id: 33,
                                  span: {
                                    start_line: 13,
                                    start_column: 50,
                                    end_line: 13,
                                    end_column: 61,
                                  },
                                },
                                {
                                  expr: {
                                    LiteralValue: {
                                      Int: "100",
                                    },
                                  },
                                  id: 34,
                                  span: {
                                    start_line: 13,
                                    start_column: 63,
                                    end_line: 13,
                                    end_column: 65,
                                  },
                                },
                              ],
                            },
                            id: 32,
                            span: {
                              start_line: 13,
                              start_column: 49,
                              end_line: 13,
                              end_column: 66,
                            },
                          },
                        ],
                      },
                      id: 30,
                      span: {
                        start_line: 13,
                        start_column: 34,
                        end_line: 13,
                        end_column: 67,
                      },
                    },
                    {
                      expr: {
                        List: [
                          {
                            expr: {
                              Atom: "called",
                            },
                            id: 36,
                            span: {
                              start_line: 13,
                              start_column: 70,
                              end_line: 13,
                              end_column: 75,
                            },
                          },
                          {
                            expr: {
                              Atom: "uint",
                            },
                            id: 37,
                            span: {
                              start_line: 13,
                              start_column: 77,
                              end_line: 13,
                              end_column: 80,
                            },
                          },
                        ],
                      },
                      id: 35,
                      span: {
                        start_line: 13,
                        start_column: 69,
                        end_line: 13,
                        end_column: 81,
                      },
                    },
                  ],
                },
                id: 28,
                span: {
                  start_line: 13,
                  start_column: 18,
                  end_line: 13,
                  end_column: 82,
                },
              },
              {
                expr: {
                  List: [
                    {
                      expr: {
                        Atom: "ok",
                      },
                      id: 39,
                      span: {
                        start_line: 14,
                        start_column: 6,
                        end_line: 14,
                        end_column: 7,
                      },
                    },
                    {
                      expr: {
                        List: [
                          {
                            expr: {
                              Atom: "map-set",
                            },
                            id: 41,
                            span: {
                              start_line: 14,
                              start_column: 10,
                              end_line: 14,
                              end_column: 16,
                            },
                          },
                          {
                            expr: {
                              Atom: "context",
                            },
                            id: 42,
                            span: {
                              start_line: 14,
                              start_column: 18,
                              end_line: 14,
                              end_column: 24,
                            },
                          },
                          {
                            expr: {
                              Atom: "function-name",
                            },
                            id: 43,
                            span: {
                              start_line: 14,
                              start_column: 26,
                              end_line: 14,
                              end_column: 38,
                            },
                          },
                          {
                            expr: {
                              List: [
                                {
                                  expr: {
                                    Atom: "tuple",
                                  },
                                  id: 45,
                                  span: {
                                    start_line: 0,
                                    start_column: 0,
                                    end_line: 0,
                                    end_column: 0,
                                  },
                                },
                                {
                                  expr: {
                                    List: [
                                      {
                                        expr: {
                                          Atom: "called",
                                        },
                                        id: 47,
                                        span: {
                                          start_line: 14,
                                          start_column: 41,
                                          end_line: 14,
                                          end_column: 46,
                                        },
                                      },
                                      {
                                        expr: {
                                          Atom: "called",
                                        },
                                        id: 48,
                                        span: {
                                          start_line: 14,
                                          start_column: 49,
                                          end_line: 14,
                                          end_column: 54,
                                        },
                                      },
                                    ],
                                  },
                                  id: 46,
                                  span: {
                                    start_line: 14,
                                    start_column: 41,
                                    end_line: 14,
                                    end_column: 54,
                                  },
                                },
                              ],
                            },
                            id: 44,
                            span: {
                              start_line: 14,
                              start_column: 40,
                              end_line: 14,
                              end_column: 55,
                            },
                          },
                        ],
                      },
                      id: 40,
                      span: {
                        start_line: 14,
                        start_column: 9,
                        end_line: 14,
                        end_column: 56,
                      },
                    },
                  ],
                },
                id: 38,
                span: {
                  start_line: 14,
                  start_column: 5,
                  end_line: 14,
                  end_column: 57,
                },
              },
            ],
          },
          id: 26,
          span: {
            start_line: 13,
            start_column: 3,
            end_line: 14,
            end_column: 58,
          },
        },
        {
          expr: {
            List: [
              {
                expr: {
                  Atom: "define-public",
                },
                id: 50,
                span: {
                  start_line: 16,
                  start_column: 2,
                  end_line: 16,
                  end_column: 14,
                },
              },
              {
                expr: {
                  List: [
                    {
                      expr: {
                        Atom: "test-no-trait",
                      },
                      id: 52,
                      span: {
                        start_line: 16,
                        start_column: 17,
                        end_line: 16,
                        end_column: 29,
                      },
                    },
                  ],
                },
                id: 51,
                span: {
                  start_line: 16,
                  start_column: 16,
                  end_line: 16,
                  end_column: 30,
                },
              },
              {
                expr: {
                  List: [
                    {
                      expr: {
                        Atom: "ok",
                      },
                      id: 54,
                      span: {
                        start_line: 17,
                        start_column: 4,
                        end_line: 17,
                        end_column: 5,
                      },
                    },
                    {
                      expr: {
                        Atom: "true",
                      },
                      id: 55,
                      span: {
                        start_line: 17,
                        start_column: 7,
                        end_line: 17,
                        end_column: 10,
                      },
                    },
                  ],
                },
                id: 53,
                span: {
                  start_line: 17,
                  start_column: 3,
                  end_line: 17,
                  end_column: 11,
                },
              },
            ],
          },
          id: 49,
          span: {
            start_line: 16,
            start_column: 1,
            end_line: 18,
            end_column: 1,
          },
        },
        {
          expr: {
            List: [
              {
                expr: {
                  Atom: "define-public",
                },
                id: 57,
                span: {
                  start_line: 20,
                  start_column: 2,
                  end_line: 20,
                  end_column: 14,
                },
              },
              {
                expr: {
                  List: [
                    {
                      expr: {
                        Atom: "test-trait",
                      },
                      id: 59,
                      span: {
                        start_line: 20,
                        start_column: 17,
                        end_line: 20,
                        end_column: 26,
                      },
                    },
                    {
                      expr: {
                        List: [
                          {
                            expr: {
                              Atom: "token",
                            },
                            id: 61,
                            span: {
                              start_line: 20,
                              start_column: 29,
                              end_line: 20,
                              end_column: 33,
                            },
                          },
                          {
                            expr: {
                              TraitReference: [
                                "ft-trait",
                                {
                                  Defined: {
                                    name: "sip-010-trait",
                                    contract_identifier: {
                                      issuer: [
                                        22,
                                        [
                                          9, 159, 184, 137, 38, 216, 47, 48,
                                          178, 244, 14, 175, 62, 228, 35, 203,
                                          114, 91, 219, 59,
                                        ],
                                      ],
                                      name: "sip-010-trait-ft-standard",
                                    },
                                  },
                                },
                              ],
                            },
                            id: 62,
                            span: {
                              start_line: 20,
                              start_column: 35,
                              end_line: 20,
                              end_column: 44,
                            },
                          },
                        ],
                      },
                      id: 60,
                      span: {
                        start_line: 20,
                        start_column: 28,
                        end_line: 20,
                        end_column: 45,
                      },
                    },
                  ],
                },
                id: 58,
                span: {
                  start_line: 20,
                  start_column: 16,
                  end_line: 20,
                  end_column: 46,
                },
              },
              {
                expr: {
                  List: [
                    {
                      expr: {
                        Atom: "ok",
                      },
                      id: 64,
                      span: {
                        start_line: 21,
                        start_column: 4,
                        end_line: 21,
                        end_column: 5,
                      },
                    },
                    {
                      expr: {
                        Atom: "true",
                      },
                      id: 65,
                      span: {
                        start_line: 21,
                        start_column: 7,
                        end_line: 21,
                        end_column: 10,
                      },
                    },
                  ],
                },
                id: 63,
                span: {
                  start_line: 21,
                  start_column: 3,
                  end_line: 21,
                  end_column: 11,
                },
              },
            ],
          },
          id: 56,
          span: {
            start_line: 20,
            start_column: 1,
            end_line: 22,
            end_column: 1,
          },
        },
      ],
      top_level_expression_sorting: [0, 1, 2, 3, 4, 5],
      referenced_traits: {},
      implemented_traits: [],
    },
  },
  directTrait2ndParameter: {
    functionsInterfaces: [
      {
        name: "function",
        access: "public",
        args: [],
        outputs: {
          type: {
            response: {
              ok: "bool",
              error: "none",
            },
          },
        },
      },
      {
        name: "test-no-trait",
        access: "public",
        args: [],
        outputs: {
          type: {
            response: {
              ok: "bool",
              error: "none",
            },
          },
        },
      },
      {
        name: "test-trait",
        access: "public",
        args: [
          {
            name: "a",
            type: "uint128",
          },
          {
            name: "token",
            type: "trait_reference",
          },
        ],
        outputs: {
          type: {
            response: {
              ok: "bool",
              error: "none",
            },
          },
        },
      },
    ],
    ast: {
      contract_identifier: {
        issuer: [
          26,
          [
            109, 120, 222, 123, 6, 37, 223, 191, 193, 108, 58, 138, 87, 53, 246,
            220, 61, 195, 242, 206,
          ],
        ],
        name: "trait-contract",
      },
      pre_expressions: [],
      expressions: [
        {
          expr: {
            List: [
              {
                expr: {
                  Atom: "define-public",
                },
                id: 2,
                span: {
                  start_line: 1,
                  start_column: 2,
                  end_line: 1,
                  end_column: 14,
                },
              },
              {
                expr: {
                  List: [
                    {
                      expr: {
                        Atom: "function",
                      },
                      id: 4,
                      span: {
                        start_line: 1,
                        start_column: 17,
                        end_line: 1,
                        end_column: 24,
                      },
                    },
                  ],
                },
                id: 3,
                span: {
                  start_line: 1,
                  start_column: 16,
                  end_line: 1,
                  end_column: 25,
                },
              },
              {
                expr: {
                  List: [
                    {
                      expr: {
                        Atom: "ok",
                      },
                      id: 6,
                      span: {
                        start_line: 2,
                        start_column: 4,
                        end_line: 2,
                        end_column: 5,
                      },
                    },
                    {
                      expr: {
                        Atom: "true",
                      },
                      id: 7,
                      span: {
                        start_line: 2,
                        start_column: 7,
                        end_line: 2,
                        end_column: 10,
                      },
                    },
                  ],
                },
                id: 5,
                span: {
                  start_line: 2,
                  start_column: 3,
                  end_line: 2,
                  end_column: 11,
                },
              },
            ],
          },
          id: 1,
          span: {
            start_line: 1,
            start_column: 1,
            end_line: 3,
            end_column: 1,
          },
        },
        {
          expr: {
            List: [
              {
                expr: {
                  Atom: "define-map",
                },
                id: 9,
                span: {
                  start_line: 6,
                  start_column: 2,
                  end_line: 6,
                  end_column: 11,
                },
              },
              {
                expr: {
                  Atom: "context",
                },
                id: 10,
                span: {
                  start_line: 6,
                  start_column: 13,
                  end_line: 6,
                  end_column: 19,
                },
              },
              {
                expr: {
                  List: [
                    {
                      expr: {
                        Atom: "string-ascii",
                      },
                      id: 12,
                      span: {
                        start_line: 6,
                        start_column: 22,
                        end_line: 6,
                        end_column: 33,
                      },
                    },
                    {
                      expr: {
                        LiteralValue: {
                          Int: "100",
                        },
                      },
                      id: 13,
                      span: {
                        start_line: 6,
                        start_column: 35,
                        end_line: 6,
                        end_column: 37,
                      },
                    },
                  ],
                },
                id: 11,
                span: {
                  start_line: 6,
                  start_column: 21,
                  end_line: 6,
                  end_column: 38,
                },
              },
              {
                expr: {
                  List: [
                    {
                      expr: {
                        Atom: "tuple",
                      },
                      id: 15,
                      span: {
                        start_line: 0,
                        start_column: 0,
                        end_line: 0,
                        end_column: 0,
                      },
                    },
                    {
                      expr: {
                        List: [
                          {
                            expr: {
                              Atom: "called",
                            },
                            id: 17,
                            span: {
                              start_line: 7,
                              start_column: 5,
                              end_line: 7,
                              end_column: 10,
                            },
                          },
                          {
                            expr: {
                              Atom: "uint",
                            },
                            id: 18,
                            span: {
                              start_line: 7,
                              start_column: 13,
                              end_line: 7,
                              end_column: 16,
                            },
                            post_comments: [
                              [
                                "other data",
                                {
                                  start_line: 8,
                                  start_column: 5,
                                  end_line: 8,
                                  end_column: 17,
                                },
                              ],
                            ],
                          },
                        ],
                      },
                      id: 16,
                      span: {
                        start_line: 7,
                        start_column: 5,
                        end_line: 7,
                        end_column: 16,
                      },
                    },
                  ],
                },
                id: 14,
                span: {
                  start_line: 6,
                  start_column: 40,
                  end_line: 9,
                  end_column: 3,
                },
              },
            ],
          },
          id: 8,
          span: {
            start_line: 6,
            start_column: 1,
            end_line: 9,
            end_column: 4,
          },
        },
        {
          expr: {
            List: [
              {
                expr: {
                  Atom: "define-public",
                },
                id: 20,
                span: {
                  start_line: 11,
                  start_column: 4,
                  end_line: 11,
                  end_column: 16,
                },
              },
              {
                expr: {
                  List: [
                    {
                      expr: {
                        Atom: "update-context",
                      },
                      id: 22,
                      span: {
                        start_line: 11,
                        start_column: 19,
                        end_line: 11,
                        end_column: 32,
                      },
                    },
                    {
                      expr: {
                        List: [
                          {
                            expr: {
                              Atom: "function-name",
                            },
                            id: 24,
                            span: {
                              start_line: 11,
                              start_column: 35,
                              end_line: 11,
                              end_column: 47,
                            },
                          },
                          {
                            expr: {
                              List: [
                                {
                                  expr: {
                                    Atom: "string-ascii",
                                  },
                                  id: 26,
                                  span: {
                                    start_line: 11,
                                    start_column: 50,
                                    end_line: 11,
                                    end_column: 61,
                                  },
                                },
                                {
                                  expr: {
                                    LiteralValue: {
                                      Int: "100",
                                    },
                                  },
                                  id: 27,
                                  span: {
                                    start_line: 11,
                                    start_column: 63,
                                    end_line: 11,
                                    end_column: 65,
                                  },
                                },
                              ],
                            },
                            id: 25,
                            span: {
                              start_line: 11,
                              start_column: 49,
                              end_line: 11,
                              end_column: 66,
                            },
                          },
                        ],
                      },
                      id: 23,
                      span: {
                        start_line: 11,
                        start_column: 34,
                        end_line: 11,
                        end_column: 67,
                      },
                    },
                    {
                      expr: {
                        List: [
                          {
                            expr: {
                              Atom: "called",
                            },
                            id: 29,
                            span: {
                              start_line: 11,
                              start_column: 70,
                              end_line: 11,
                              end_column: 75,
                            },
                          },
                          {
                            expr: {
                              Atom: "uint",
                            },
                            id: 30,
                            span: {
                              start_line: 11,
                              start_column: 77,
                              end_line: 11,
                              end_column: 80,
                            },
                          },
                        ],
                      },
                      id: 28,
                      span: {
                        start_line: 11,
                        start_column: 69,
                        end_line: 11,
                        end_column: 81,
                      },
                    },
                  ],
                },
                id: 21,
                span: {
                  start_line: 11,
                  start_column: 18,
                  end_line: 11,
                  end_column: 82,
                },
              },
              {
                expr: {
                  List: [
                    {
                      expr: {
                        Atom: "ok",
                      },
                      id: 32,
                      span: {
                        start_line: 12,
                        start_column: 6,
                        end_line: 12,
                        end_column: 7,
                      },
                    },
                    {
                      expr: {
                        List: [
                          {
                            expr: {
                              Atom: "map-set",
                            },
                            id: 34,
                            span: {
                              start_line: 12,
                              start_column: 10,
                              end_line: 12,
                              end_column: 16,
                            },
                          },
                          {
                            expr: {
                              Atom: "context",
                            },
                            id: 35,
                            span: {
                              start_line: 12,
                              start_column: 18,
                              end_line: 12,
                              end_column: 24,
                            },
                          },
                          {
                            expr: {
                              Atom: "function-name",
                            },
                            id: 36,
                            span: {
                              start_line: 12,
                              start_column: 26,
                              end_line: 12,
                              end_column: 38,
                            },
                          },
                          {
                            expr: {
                              List: [
                                {
                                  expr: {
                                    Atom: "tuple",
                                  },
                                  id: 38,
                                  span: {
                                    start_line: 0,
                                    start_column: 0,
                                    end_line: 0,
                                    end_column: 0,
                                  },
                                },
                                {
                                  expr: {
                                    List: [
                                      {
                                        expr: {
                                          Atom: "called",
                                        },
                                        id: 40,
                                        span: {
                                          start_line: 12,
                                          start_column: 41,
                                          end_line: 12,
                                          end_column: 46,
                                        },
                                      },
                                      {
                                        expr: {
                                          Atom: "called",
                                        },
                                        id: 41,
                                        span: {
                                          start_line: 12,
                                          start_column: 49,
                                          end_line: 12,
                                          end_column: 54,
                                        },
                                      },
                                    ],
                                  },
                                  id: 39,
                                  span: {
                                    start_line: 12,
                                    start_column: 41,
                                    end_line: 12,
                                    end_column: 54,
                                  },
                                },
                              ],
                            },
                            id: 37,
                            span: {
                              start_line: 12,
                              start_column: 40,
                              end_line: 12,
                              end_column: 55,
                            },
                          },
                        ],
                      },
                      id: 33,
                      span: {
                        start_line: 12,
                        start_column: 9,
                        end_line: 12,
                        end_column: 56,
                      },
                    },
                  ],
                },
                id: 31,
                span: {
                  start_line: 12,
                  start_column: 5,
                  end_line: 12,
                  end_column: 57,
                },
              },
            ],
          },
          id: 19,
          span: {
            start_line: 11,
            start_column: 3,
            end_line: 12,
            end_column: 58,
          },
        },
        {
          expr: {
            List: [
              {
                expr: {
                  Atom: "use-trait",
                },
                id: 43,
                span: {
                  start_line: 14,
                  start_column: 2,
                  end_line: 14,
                  end_column: 10,
                },
              },
              {
                expr: {
                  Atom: "ft-trait",
                },
                id: 44,
                span: {
                  start_line: 14,
                  start_column: 12,
                  end_line: 14,
                  end_column: 19,
                },
              },
              {
                expr: {
                  Field: {
                    name: "sip-010-trait",
                    contract_identifier: {
                      issuer: [
                        22,
                        [
                          9, 159, 184, 137, 38, 216, 47, 48, 178, 244, 14, 175,
                          62, 228, 35, 203, 114, 91, 219, 59,
                        ],
                      ],
                      name: "sip-010-trait-ft-standard",
                    },
                  },
                },
                id: 45,
                span: {
                  start_line: 14,
                  start_column: 21,
                  end_line: 14,
                  end_column: 101,
                },
              },
            ],
          },
          id: 42,
          span: {
            start_line: 14,
            start_column: 1,
            end_line: 14,
            end_column: 102,
          },
        },
        {
          expr: {
            List: [
              {
                expr: {
                  Atom: "define-public",
                },
                id: 47,
                span: {
                  start_line: 16,
                  start_column: 2,
                  end_line: 16,
                  end_column: 14,
                },
              },
              {
                expr: {
                  List: [
                    {
                      expr: {
                        Atom: "test-no-trait",
                      },
                      id: 49,
                      span: {
                        start_line: 16,
                        start_column: 17,
                        end_line: 16,
                        end_column: 29,
                      },
                    },
                  ],
                },
                id: 48,
                span: {
                  start_line: 16,
                  start_column: 16,
                  end_line: 16,
                  end_column: 30,
                },
              },
              {
                expr: {
                  List: [
                    {
                      expr: {
                        Atom: "ok",
                      },
                      id: 51,
                      span: {
                        start_line: 17,
                        start_column: 4,
                        end_line: 17,
                        end_column: 5,
                      },
                    },
                    {
                      expr: {
                        Atom: "true",
                      },
                      id: 52,
                      span: {
                        start_line: 17,
                        start_column: 7,
                        end_line: 17,
                        end_column: 10,
                      },
                    },
                  ],
                },
                id: 50,
                span: {
                  start_line: 17,
                  start_column: 3,
                  end_line: 17,
                  end_column: 11,
                },
              },
            ],
          },
          id: 46,
          span: {
            start_line: 16,
            start_column: 1,
            end_line: 18,
            end_column: 1,
          },
        },
        {
          expr: {
            List: [
              {
                expr: {
                  Atom: "define-public",
                },
                id: 54,
                span: {
                  start_line: 20,
                  start_column: 2,
                  end_line: 20,
                  end_column: 14,
                },
              },
              {
                expr: {
                  List: [
                    {
                      expr: {
                        Atom: "test-trait",
                      },
                      id: 56,
                      span: {
                        start_line: 20,
                        start_column: 17,
                        end_line: 20,
                        end_column: 26,
                      },
                    },
                    {
                      expr: {
                        List: [
                          {
                            expr: {
                              Atom: "a",
                            },
                            id: 58,
                            span: {
                              start_line: 20,
                              start_column: 29,
                              end_line: 20,
                              end_column: 29,
                            },
                          },
                          {
                            expr: {
                              Atom: "uint",
                            },
                            id: 59,
                            span: {
                              start_line: 20,
                              start_column: 31,
                              end_line: 20,
                              end_column: 34,
                            },
                          },
                        ],
                      },
                      id: 57,
                      span: {
                        start_line: 20,
                        start_column: 28,
                        end_line: 20,
                        end_column: 35,
                      },
                    },
                    {
                      expr: {
                        List: [
                          {
                            expr: {
                              Atom: "token",
                            },
                            id: 61,
                            span: {
                              start_line: 20,
                              start_column: 38,
                              end_line: 20,
                              end_column: 42,
                            },
                          },
                          {
                            expr: {
                              TraitReference: [
                                "ft-trait",
                                {
                                  Imported: {
                                    name: "sip-010-trait",
                                    contract_identifier: {
                                      issuer: [
                                        22,
                                        [
                                          9, 159, 184, 137, 38, 216, 47, 48,
                                          178, 244, 14, 175, 62, 228, 35, 203,
                                          114, 91, 219, 59,
                                        ],
                                      ],
                                      name: "sip-010-trait-ft-standard",
                                    },
                                  },
                                },
                              ],
                            },
                            id: 62,
                            span: {
                              start_line: 20,
                              start_column: 44,
                              end_line: 20,
                              end_column: 53,
                            },
                          },
                        ],
                      },
                      id: 60,
                      span: {
                        start_line: 20,
                        start_column: 37,
                        end_line: 20,
                        end_column: 54,
                      },
                    },
                  ],
                },
                id: 55,
                span: {
                  start_line: 20,
                  start_column: 16,
                  end_line: 20,
                  end_column: 55,
                },
              },
              {
                expr: {
                  List: [
                    {
                      expr: {
                        Atom: "ok",
                      },
                      id: 64,
                      span: {
                        start_line: 21,
                        start_column: 4,
                        end_line: 21,
                        end_column: 5,
                      },
                    },
                    {
                      expr: {
                        Atom: "true",
                      },
                      id: 65,
                      span: {
                        start_line: 21,
                        start_column: 7,
                        end_line: 21,
                        end_column: 10,
                      },
                    },
                  ],
                },
                id: 63,
                span: {
                  start_line: 21,
                  start_column: 3,
                  end_line: 21,
                  end_column: 11,
                },
              },
            ],
          },
          id: 53,
          span: {
            start_line: 20,
            start_column: 1,
            end_line: 22,
            end_column: 1,
          },
        },
      ],
      top_level_expression_sorting: [0, 1, 2, 3, 4, 5],
      referenced_traits: {},
      implemented_traits: [],
    },
  },
  directTrait5thParameter: {
    functionsInterfaces: [
      {
        name: "function",
        access: "public",
        args: [],
        outputs: {
          type: {
            response: {
              ok: "bool",
              error: "none",
            },
          },
        },
      },
      {
        name: "test-no-trait",
        access: "public",
        args: [],
        outputs: {
          type: {
            response: {
              ok: "bool",
              error: "none",
            },
          },
        },
      },
      {
        name: "test-trait",
        access: "public",
        args: [
          {
            name: "a",
            type: "uint128",
          },
          {
            name: "b",
            type: "int128",
          },
          {
            name: "c",
            type: "bool",
          },
          {
            name: "d",
            type: {
              "string-ascii": {
                length: 10,
              },
            },
          },
          {
            name: "e",
            type: "trait_reference",
          },
        ],
        outputs: {
          type: {
            response: {
              ok: "bool",
              error: "none",
            },
          },
        },
      },
      {
        name: "update-context",
        access: "public",
        args: [
          {
            name: "function-name",
            type: {
              "string-ascii": {
                length: 100,
              },
            },
          },
          {
            name: "called",
            type: "uint128",
          },
        ],
        outputs: {
          type: {
            response: {
              ok: "bool",
              error: "none",
            },
          },
        },
      },
    ],
    ast: {
      contract_identifier: {
        issuer: [
          26,
          [
            109, 120, 222, 123, 6, 37, 223, 191, 193, 108, 58, 138, 87, 53, 246,
            220, 61, 195, 242, 206,
          ],
        ],
        name: "trait-contract",
      },
      pre_expressions: [],
      expressions: [
        {
          expr: {
            List: [
              {
                expr: {
                  Atom: "define-public",
                },
                id: 2,
                span: {
                  start_line: 1,
                  start_column: 2,
                  end_line: 1,
                  end_column: 14,
                },
              },
              {
                expr: {
                  List: [
                    {
                      expr: {
                        Atom: "function",
                      },
                      id: 4,
                      span: {
                        start_line: 1,
                        start_column: 17,
                        end_line: 1,
                        end_column: 24,
                      },
                    },
                  ],
                },
                id: 3,
                span: {
                  start_line: 1,
                  start_column: 16,
                  end_line: 1,
                  end_column: 25,
                },
              },
              {
                expr: {
                  List: [
                    {
                      expr: {
                        Atom: "ok",
                      },
                      id: 6,
                      span: {
                        start_line: 2,
                        start_column: 4,
                        end_line: 2,
                        end_column: 5,
                      },
                    },
                    {
                      expr: {
                        Atom: "true",
                      },
                      id: 7,
                      span: {
                        start_line: 2,
                        start_column: 7,
                        end_line: 2,
                        end_column: 10,
                      },
                    },
                  ],
                },
                id: 5,
                span: {
                  start_line: 2,
                  start_column: 3,
                  end_line: 2,
                  end_column: 11,
                },
              },
            ],
          },
          id: 1,
          span: {
            start_line: 1,
            start_column: 1,
            end_line: 3,
            end_column: 1,
          },
        },
        {
          expr: {
            List: [
              {
                expr: {
                  Atom: "define-map",
                },
                id: 9,
                span: {
                  start_line: 6,
                  start_column: 2,
                  end_line: 6,
                  end_column: 11,
                },
              },
              {
                expr: {
                  Atom: "context",
                },
                id: 10,
                span: {
                  start_line: 6,
                  start_column: 13,
                  end_line: 6,
                  end_column: 19,
                },
              },
              {
                expr: {
                  List: [
                    {
                      expr: {
                        Atom: "string-ascii",
                      },
                      id: 12,
                      span: {
                        start_line: 6,
                        start_column: 22,
                        end_line: 6,
                        end_column: 33,
                      },
                    },
                    {
                      expr: {
                        LiteralValue: {
                          Int: "100",
                        },
                      },
                      id: 13,
                      span: {
                        start_line: 6,
                        start_column: 35,
                        end_line: 6,
                        end_column: 37,
                      },
                    },
                  ],
                },
                id: 11,
                span: {
                  start_line: 6,
                  start_column: 21,
                  end_line: 6,
                  end_column: 38,
                },
              },
              {
                expr: {
                  List: [
                    {
                      expr: {
                        Atom: "tuple",
                      },
                      id: 15,
                      span: {
                        start_line: 0,
                        start_column: 0,
                        end_line: 0,
                        end_column: 0,
                      },
                    },
                    {
                      expr: {
                        List: [
                          {
                            expr: {
                              Atom: "called",
                            },
                            id: 17,
                            span: {
                              start_line: 7,
                              start_column: 5,
                              end_line: 7,
                              end_column: 10,
                            },
                          },
                          {
                            expr: {
                              Atom: "uint",
                            },
                            id: 18,
                            span: {
                              start_line: 7,
                              start_column: 13,
                              end_line: 7,
                              end_column: 16,
                            },
                            post_comments: [
                              [
                                "other data",
                                {
                                  start_line: 8,
                                  start_column: 5,
                                  end_line: 8,
                                  end_column: 17,
                                },
                              ],
                            ],
                          },
                        ],
                      },
                      id: 16,
                      span: {
                        start_line: 7,
                        start_column: 5,
                        end_line: 7,
                        end_column: 16,
                      },
                    },
                  ],
                },
                id: 14,
                span: {
                  start_line: 6,
                  start_column: 40,
                  end_line: 9,
                  end_column: 3,
                },
              },
            ],
          },
          id: 8,
          span: {
            start_line: 6,
            start_column: 1,
            end_line: 9,
            end_column: 4,
          },
        },
        {
          expr: {
            List: [
              {
                expr: {
                  Atom: "define-public",
                },
                id: 20,
                span: {
                  start_line: 11,
                  start_column: 4,
                  end_line: 11,
                  end_column: 16,
                },
              },
              {
                expr: {
                  List: [
                    {
                      expr: {
                        Atom: "update-context",
                      },
                      id: 22,
                      span: {
                        start_line: 11,
                        start_column: 19,
                        end_line: 11,
                        end_column: 32,
                      },
                    },
                    {
                      expr: {
                        List: [
                          {
                            expr: {
                              Atom: "function-name",
                            },
                            id: 24,
                            span: {
                              start_line: 11,
                              start_column: 35,
                              end_line: 11,
                              end_column: 47,
                            },
                          },
                          {
                            expr: {
                              List: [
                                {
                                  expr: {
                                    Atom: "string-ascii",
                                  },
                                  id: 26,
                                  span: {
                                    start_line: 11,
                                    start_column: 50,
                                    end_line: 11,
                                    end_column: 61,
                                  },
                                },
                                {
                                  expr: {
                                    LiteralValue: {
                                      Int: "100",
                                    },
                                  },
                                  id: 27,
                                  span: {
                                    start_line: 11,
                                    start_column: 63,
                                    end_line: 11,
                                    end_column: 65,
                                  },
                                },
                              ],
                            },
                            id: 25,
                            span: {
                              start_line: 11,
                              start_column: 49,
                              end_line: 11,
                              end_column: 66,
                            },
                          },
                        ],
                      },
                      id: 23,
                      span: {
                        start_line: 11,
                        start_column: 34,
                        end_line: 11,
                        end_column: 67,
                      },
                    },
                    {
                      expr: {
                        List: [
                          {
                            expr: {
                              Atom: "called",
                            },
                            id: 29,
                            span: {
                              start_line: 11,
                              start_column: 70,
                              end_line: 11,
                              end_column: 75,
                            },
                          },
                          {
                            expr: {
                              Atom: "uint",
                            },
                            id: 30,
                            span: {
                              start_line: 11,
                              start_column: 77,
                              end_line: 11,
                              end_column: 80,
                            },
                          },
                        ],
                      },
                      id: 28,
                      span: {
                        start_line: 11,
                        start_column: 69,
                        end_line: 11,
                        end_column: 81,
                      },
                    },
                  ],
                },
                id: 21,
                span: {
                  start_line: 11,
                  start_column: 18,
                  end_line: 11,
                  end_column: 82,
                },
              },
              {
                expr: {
                  List: [
                    {
                      expr: {
                        Atom: "ok",
                      },
                      id: 32,
                      span: {
                        start_line: 12,
                        start_column: 6,
                        end_line: 12,
                        end_column: 7,
                      },
                    },
                    {
                      expr: {
                        List: [
                          {
                            expr: {
                              Atom: "map-set",
                            },
                            id: 34,
                            span: {
                              start_line: 12,
                              start_column: 10,
                              end_line: 12,
                              end_column: 16,
                            },
                          },
                          {
                            expr: {
                              Atom: "context",
                            },
                            id: 35,
                            span: {
                              start_line: 12,
                              start_column: 18,
                              end_line: 12,
                              end_column: 24,
                            },
                          },
                          {
                            expr: {
                              Atom: "function-name",
                            },
                            id: 36,
                            span: {
                              start_line: 12,
                              start_column: 26,
                              end_line: 12,
                              end_column: 38,
                            },
                          },
                          {
                            expr: {
                              List: [
                                {
                                  expr: {
                                    Atom: "tuple",
                                  },
                                  id: 38,
                                  span: {
                                    start_line: 0,
                                    start_column: 0,
                                    end_line: 0,
                                    end_column: 0,
                                  },
                                },
                                {
                                  expr: {
                                    List: [
                                      {
                                        expr: {
                                          Atom: "called",
                                        },
                                        id: 40,
                                        span: {
                                          start_line: 12,
                                          start_column: 41,
                                          end_line: 12,
                                          end_column: 46,
                                        },
                                      },
                                      {
                                        expr: {
                                          Atom: "called",
                                        },
                                        id: 41,
                                        span: {
                                          start_line: 12,
                                          start_column: 49,
                                          end_line: 12,
                                          end_column: 54,
                                        },
                                      },
                                    ],
                                  },
                                  id: 39,
                                  span: {
                                    start_line: 12,
                                    start_column: 41,
                                    end_line: 12,
                                    end_column: 54,
                                  },
                                },
                              ],
                            },
                            id: 37,
                            span: {
                              start_line: 12,
                              start_column: 40,
                              end_line: 12,
                              end_column: 55,
                            },
                          },
                        ],
                      },
                      id: 33,
                      span: {
                        start_line: 12,
                        start_column: 9,
                        end_line: 12,
                        end_column: 56,
                      },
                    },
                  ],
                },
                id: 31,
                span: {
                  start_line: 12,
                  start_column: 5,
                  end_line: 12,
                  end_column: 57,
                },
              },
            ],
          },
          id: 19,
          span: {
            start_line: 11,
            start_column: 3,
            end_line: 12,
            end_column: 58,
          },
        },
        {
          expr: {
            List: [
              {
                expr: {
                  Atom: "use-trait",
                },
                id: 43,
                span: {
                  start_line: 14,
                  start_column: 2,
                  end_line: 14,
                  end_column: 10,
                },
              },
              {
                expr: {
                  Atom: "ft-trait",
                },
                id: 44,
                span: {
                  start_line: 14,
                  start_column: 12,
                  end_line: 14,
                  end_column: 19,
                },
              },
              {
                expr: {
                  Field: {
                    name: "sip-010-trait",
                    contract_identifier: {
                      issuer: [
                        22,
                        [
                          9, 159, 184, 137, 38, 216, 47, 48, 178, 244, 14, 175,
                          62, 228, 35, 203, 114, 91, 219, 59,
                        ],
                      ],
                      name: "sip-010-trait-ft-standard",
                    },
                  },
                },
                id: 45,
                span: {
                  start_line: 14,
                  start_column: 21,
                  end_line: 14,
                  end_column: 101,
                },
              },
            ],
          },
          id: 42,
          span: {
            start_line: 14,
            start_column: 1,
            end_line: 14,
            end_column: 102,
          },
        },
        {
          expr: {
            List: [
              {
                expr: {
                  Atom: "define-public",
                },
                id: 47,
                span: {
                  start_line: 16,
                  start_column: 2,
                  end_line: 16,
                  end_column: 14,
                },
              },
              {
                expr: {
                  List: [
                    {
                      expr: {
                        Atom: "test-no-trait",
                      },
                      id: 49,
                      span: {
                        start_line: 16,
                        start_column: 17,
                        end_line: 16,
                        end_column: 29,
                      },
                    },
                  ],
                },
                id: 48,
                span: {
                  start_line: 16,
                  start_column: 16,
                  end_line: 16,
                  end_column: 30,
                },
              },
              {
                expr: {
                  List: [
                    {
                      expr: {
                        Atom: "ok",
                      },
                      id: 51,
                      span: {
                        start_line: 17,
                        start_column: 4,
                        end_line: 17,
                        end_column: 5,
                      },
                    },
                    {
                      expr: {
                        Atom: "true",
                      },
                      id: 52,
                      span: {
                        start_line: 17,
                        start_column: 7,
                        end_line: 17,
                        end_column: 10,
                      },
                    },
                  ],
                },
                id: 50,
                span: {
                  start_line: 17,
                  start_column: 3,
                  end_line: 17,
                  end_column: 11,
                },
              },
            ],
          },
          id: 46,
          span: {
            start_line: 16,
            start_column: 1,
            end_line: 18,
            end_column: 1,
          },
        },
        {
          expr: {
            List: [
              {
                expr: {
                  Atom: "define-public",
                },
                id: 54,
                span: {
                  start_line: 20,
                  start_column: 2,
                  end_line: 20,
                  end_column: 14,
                },
              },
              {
                expr: {
                  List: [
                    {
                      expr: {
                        Atom: "test-trait",
                      },
                      id: 56,
                      span: {
                        start_line: 20,
                        start_column: 17,
                        end_line: 20,
                        end_column: 26,
                      },
                    },
                    {
                      expr: {
                        List: [
                          {
                            expr: {
                              Atom: "a",
                            },
                            id: 58,
                            span: {
                              start_line: 20,
                              start_column: 29,
                              end_line: 20,
                              end_column: 29,
                            },
                          },
                          {
                            expr: {
                              Atom: "uint",
                            },
                            id: 59,
                            span: {
                              start_line: 20,
                              start_column: 31,
                              end_line: 20,
                              end_column: 34,
                            },
                          },
                        ],
                      },
                      id: 57,
                      span: {
                        start_line: 20,
                        start_column: 28,
                        end_line: 20,
                        end_column: 35,
                      },
                    },
                    {
                      expr: {
                        List: [
                          {
                            expr: {
                              Atom: "b",
                            },
                            id: 61,
                            span: {
                              start_line: 20,
                              start_column: 38,
                              end_line: 20,
                              end_column: 38,
                            },
                          },
                          {
                            expr: {
                              Atom: "int",
                            },
                            id: 62,
                            span: {
                              start_line: 20,
                              start_column: 40,
                              end_line: 20,
                              end_column: 42,
                            },
                          },
                        ],
                      },
                      id: 60,
                      span: {
                        start_line: 20,
                        start_column: 37,
                        end_line: 20,
                        end_column: 43,
                      },
                    },
                    {
                      expr: {
                        List: [
                          {
                            expr: {
                              Atom: "c",
                            },
                            id: 64,
                            span: {
                              start_line: 20,
                              start_column: 46,
                              end_line: 20,
                              end_column: 46,
                            },
                          },
                          {
                            expr: {
                              Atom: "bool",
                            },
                            id: 65,
                            span: {
                              start_line: 20,
                              start_column: 48,
                              end_line: 20,
                              end_column: 51,
                            },
                          },
                        ],
                      },
                      id: 63,
                      span: {
                        start_line: 20,
                        start_column: 45,
                        end_line: 20,
                        end_column: 52,
                      },
                    },
                    {
                      expr: {
                        List: [
                          {
                            expr: {
                              Atom: "d",
                            },
                            id: 67,
                            span: {
                              start_line: 20,
                              start_column: 55,
                              end_line: 20,
                              end_column: 55,
                            },
                          },
                          {
                            expr: {
                              List: [
                                {
                                  expr: {
                                    Atom: "string-ascii",
                                  },
                                  id: 69,
                                  span: {
                                    start_line: 20,
                                    start_column: 58,
                                    end_line: 20,
                                    end_column: 69,
                                  },
                                },
                                {
                                  expr: {
                                    LiteralValue: {
                                      Int: "10",
                                    },
                                  },
                                  id: 70,
                                  span: {
                                    start_line: 20,
                                    start_column: 71,
                                    end_line: 20,
                                    end_column: 72,
                                  },
                                },
                              ],
                            },
                            id: 68,
                            span: {
                              start_line: 20,
                              start_column: 57,
                              end_line: 20,
                              end_column: 73,
                            },
                          },
                        ],
                      },
                      id: 66,
                      span: {
                        start_line: 20,
                        start_column: 54,
                        end_line: 20,
                        end_column: 74,
                      },
                    },
                    {
                      expr: {
                        List: [
                          {
                            expr: {
                              Atom: "e",
                            },
                            id: 72,
                            span: {
                              start_line: 20,
                              start_column: 77,
                              end_line: 20,
                              end_column: 77,
                            },
                          },
                          {
                            expr: {
                              TraitReference: [
                                "ft-trait",
                                {
                                  Imported: {
                                    name: "sip-010-trait",
                                    contract_identifier: {
                                      issuer: [
                                        22,
                                        [
                                          9, 159, 184, 137, 38, 216, 47, 48,
                                          178, 244, 14, 175, 62, 228, 35, 203,
                                          114, 91, 219, 59,
                                        ],
                                      ],
                                      name: "sip-010-trait-ft-standard",
                                    },
                                  },
                                },
                              ],
                            },
                            id: 73,
                            span: {
                              start_line: 20,
                              start_column: 79,
                              end_line: 20,
                              end_column: 88,
                            },
                          },
                        ],
                      },
                      id: 71,
                      span: {
                        start_line: 20,
                        start_column: 76,
                        end_line: 20,
                        end_column: 89,
                      },
                    },
                  ],
                },
                id: 55,
                span: {
                  start_line: 20,
                  start_column: 16,
                  end_line: 20,
                  end_column: 90,
                },
              },
              {
                expr: {
                  List: [
                    {
                      expr: {
                        Atom: "ok",
                      },
                      id: 75,
                      span: {
                        start_line: 21,
                        start_column: 4,
                        end_line: 21,
                        end_column: 5,
                      },
                    },
                    {
                      expr: {
                        Atom: "true",
                      },
                      id: 76,
                      span: {
                        start_line: 21,
                        start_column: 7,
                        end_line: 21,
                        end_column: 10,
                      },
                    },
                  ],
                },
                id: 74,
                span: {
                  start_line: 21,
                  start_column: 3,
                  end_line: 21,
                  end_column: 11,
                },
              },
            ],
          },
          id: 53,
          span: {
            start_line: 20,
            start_column: 1,
            end_line: 22,
            end_column: 1,
          },
        },
      ],
      top_level_expression_sorting: [0, 1, 2, 3, 4, 5],
      referenced_traits: {},
      implemented_traits: [],
    },
  },
  directTraitParameterPublicAndReadOnlyFunctions: {
    functionsInterfaces: [
      {
        name: "function",
        access: "public",
        args: [],
        outputs: {
          type: {
            response: {
              ok: "bool",
              error: "none",
            },
          },
        },
      },
      {
        name: "test-no-trait",
        access: "public",
        args: [],
        outputs: {
          type: {
            response: {
              ok: "bool",
              error: "none",
            },
          },
        },
      },
      {
        name: "test-trait",
        access: "public",
        args: [
          {
            name: "token",
            type: "trait_reference",
          },
        ],
        outputs: {
          type: {
            response: {
              ok: "bool",
              error: "none",
            },
          },
        },
      },
      {
        name: "update-context",
        access: "public",
        args: [
          {
            name: "function-name",
            type: {
              "string-ascii": {
                length: 100,
              },
            },
          },
          {
            name: "called",
            type: "uint128",
          },
        ],
        outputs: {
          type: {
            response: {
              ok: "bool",
              error: "none",
            },
          },
        },
      },
      {
        name: "invariant-trait",
        access: "read_only",
        args: [
          {
            name: "token",
            type: "trait_reference",
          },
        ],
        outputs: {
          type: "bool",
        },
      },
    ],
    ast: {
      contract_identifier: {
        issuer: [
          26,
          [
            109, 120, 222, 123, 6, 37, 223, 191, 193, 108, 58, 138, 87, 53, 246,
            220, 61, 195, 242, 206,
          ],
        ],
        name: "trait-contract",
      },
      pre_expressions: [],
      expressions: [
        {
          expr: {
            List: [
              {
                expr: {
                  Atom: "define-public",
                },
                id: 2,
                span: {
                  start_line: 1,
                  start_column: 2,
                  end_line: 1,
                  end_column: 14,
                },
              },
              {
                expr: {
                  List: [
                    {
                      expr: {
                        Atom: "function",
                      },
                      id: 4,
                      span: {
                        start_line: 1,
                        start_column: 17,
                        end_line: 1,
                        end_column: 24,
                      },
                    },
                  ],
                },
                id: 3,
                span: {
                  start_line: 1,
                  start_column: 16,
                  end_line: 1,
                  end_column: 25,
                },
              },
              {
                expr: {
                  List: [
                    {
                      expr: {
                        Atom: "ok",
                      },
                      id: 6,
                      span: {
                        start_line: 2,
                        start_column: 4,
                        end_line: 2,
                        end_column: 5,
                      },
                    },
                    {
                      expr: {
                        Atom: "true",
                      },
                      id: 7,
                      span: {
                        start_line: 2,
                        start_column: 7,
                        end_line: 2,
                        end_column: 10,
                      },
                    },
                  ],
                },
                id: 5,
                span: {
                  start_line: 2,
                  start_column: 3,
                  end_line: 2,
                  end_column: 11,
                },
              },
            ],
          },
          id: 1,
          span: {
            start_line: 1,
            start_column: 1,
            end_line: 3,
            end_column: 1,
          },
        },
        {
          expr: {
            List: [
              {
                expr: {
                  Atom: "define-map",
                },
                id: 9,
                span: {
                  start_line: 6,
                  start_column: 2,
                  end_line: 6,
                  end_column: 11,
                },
              },
              {
                expr: {
                  Atom: "context",
                },
                id: 10,
                span: {
                  start_line: 6,
                  start_column: 13,
                  end_line: 6,
                  end_column: 19,
                },
              },
              {
                expr: {
                  List: [
                    {
                      expr: {
                        Atom: "string-ascii",
                      },
                      id: 12,
                      span: {
                        start_line: 6,
                        start_column: 22,
                        end_line: 6,
                        end_column: 33,
                      },
                    },
                    {
                      expr: {
                        LiteralValue: {
                          Int: "100",
                        },
                      },
                      id: 13,
                      span: {
                        start_line: 6,
                        start_column: 35,
                        end_line: 6,
                        end_column: 37,
                      },
                    },
                  ],
                },
                id: 11,
                span: {
                  start_line: 6,
                  start_column: 21,
                  end_line: 6,
                  end_column: 38,
                },
              },
              {
                expr: {
                  List: [
                    {
                      expr: {
                        Atom: "tuple",
                      },
                      id: 15,
                      span: {
                        start_line: 0,
                        start_column: 0,
                        end_line: 0,
                        end_column: 0,
                      },
                    },
                    {
                      expr: {
                        List: [
                          {
                            expr: {
                              Atom: "called",
                            },
                            id: 17,
                            span: {
                              start_line: 7,
                              start_column: 5,
                              end_line: 7,
                              end_column: 10,
                            },
                          },
                          {
                            expr: {
                              Atom: "uint",
                            },
                            id: 18,
                            span: {
                              start_line: 7,
                              start_column: 13,
                              end_line: 7,
                              end_column: 16,
                            },
                            post_comments: [
                              [
                                "other data",
                                {
                                  start_line: 8,
                                  start_column: 5,
                                  end_line: 8,
                                  end_column: 17,
                                },
                              ],
                            ],
                          },
                        ],
                      },
                      id: 16,
                      span: {
                        start_line: 7,
                        start_column: 5,
                        end_line: 7,
                        end_column: 16,
                      },
                    },
                  ],
                },
                id: 14,
                span: {
                  start_line: 6,
                  start_column: 40,
                  end_line: 9,
                  end_column: 3,
                },
              },
            ],
          },
          id: 8,
          span: {
            start_line: 6,
            start_column: 1,
            end_line: 9,
            end_column: 4,
          },
        },
        {
          expr: {
            List: [
              {
                expr: {
                  Atom: "define-public",
                },
                id: 20,
                span: {
                  start_line: 11,
                  start_column: 4,
                  end_line: 11,
                  end_column: 16,
                },
              },
              {
                expr: {
                  List: [
                    {
                      expr: {
                        Atom: "update-context",
                      },
                      id: 22,
                      span: {
                        start_line: 11,
                        start_column: 19,
                        end_line: 11,
                        end_column: 32,
                      },
                    },
                    {
                      expr: {
                        List: [
                          {
                            expr: {
                              Atom: "function-name",
                            },
                            id: 24,
                            span: {
                              start_line: 11,
                              start_column: 35,
                              end_line: 11,
                              end_column: 47,
                            },
                          },
                          {
                            expr: {
                              List: [
                                {
                                  expr: {
                                    Atom: "string-ascii",
                                  },
                                  id: 26,
                                  span: {
                                    start_line: 11,
                                    start_column: 50,
                                    end_line: 11,
                                    end_column: 61,
                                  },
                                },
                                {
                                  expr: {
                                    LiteralValue: {
                                      Int: "100",
                                    },
                                  },
                                  id: 27,
                                  span: {
                                    start_line: 11,
                                    start_column: 63,
                                    end_line: 11,
                                    end_column: 65,
                                  },
                                },
                              ],
                            },
                            id: 25,
                            span: {
                              start_line: 11,
                              start_column: 49,
                              end_line: 11,
                              end_column: 66,
                            },
                          },
                        ],
                      },
                      id: 23,
                      span: {
                        start_line: 11,
                        start_column: 34,
                        end_line: 11,
                        end_column: 67,
                      },
                    },
                    {
                      expr: {
                        List: [
                          {
                            expr: {
                              Atom: "called",
                            },
                            id: 29,
                            span: {
                              start_line: 11,
                              start_column: 70,
                              end_line: 11,
                              end_column: 75,
                            },
                          },
                          {
                            expr: {
                              Atom: "uint",
                            },
                            id: 30,
                            span: {
                              start_line: 11,
                              start_column: 77,
                              end_line: 11,
                              end_column: 80,
                            },
                          },
                        ],
                      },
                      id: 28,
                      span: {
                        start_line: 11,
                        start_column: 69,
                        end_line: 11,
                        end_column: 81,
                      },
                    },
                  ],
                },
                id: 21,
                span: {
                  start_line: 11,
                  start_column: 18,
                  end_line: 11,
                  end_column: 82,
                },
              },
              {
                expr: {
                  List: [
                    {
                      expr: {
                        Atom: "ok",
                      },
                      id: 32,
                      span: {
                        start_line: 12,
                        start_column: 6,
                        end_line: 12,
                        end_column: 7,
                      },
                    },
                    {
                      expr: {
                        List: [
                          {
                            expr: {
                              Atom: "map-set",
                            },
                            id: 34,
                            span: {
                              start_line: 12,
                              start_column: 10,
                              end_line: 12,
                              end_column: 16,
                            },
                          },
                          {
                            expr: {
                              Atom: "context",
                            },
                            id: 35,
                            span: {
                              start_line: 12,
                              start_column: 18,
                              end_line: 12,
                              end_column: 24,
                            },
                          },
                          {
                            expr: {
                              Atom: "function-name",
                            },
                            id: 36,
                            span: {
                              start_line: 12,
                              start_column: 26,
                              end_line: 12,
                              end_column: 38,
                            },
                          },
                          {
                            expr: {
                              List: [
                                {
                                  expr: {
                                    Atom: "tuple",
                                  },
                                  id: 38,
                                  span: {
                                    start_line: 0,
                                    start_column: 0,
                                    end_line: 0,
                                    end_column: 0,
                                  },
                                },
                                {
                                  expr: {
                                    List: [
                                      {
                                        expr: {
                                          Atom: "called",
                                        },
                                        id: 40,
                                        span: {
                                          start_line: 12,
                                          start_column: 41,
                                          end_line: 12,
                                          end_column: 46,
                                        },
                                      },
                                      {
                                        expr: {
                                          Atom: "called",
                                        },
                                        id: 41,
                                        span: {
                                          start_line: 12,
                                          start_column: 49,
                                          end_line: 12,
                                          end_column: 54,
                                        },
                                      },
                                    ],
                                  },
                                  id: 39,
                                  span: {
                                    start_line: 12,
                                    start_column: 41,
                                    end_line: 12,
                                    end_column: 54,
                                  },
                                },
                              ],
                            },
                            id: 37,
                            span: {
                              start_line: 12,
                              start_column: 40,
                              end_line: 12,
                              end_column: 55,
                            },
                          },
                        ],
                      },
                      id: 33,
                      span: {
                        start_line: 12,
                        start_column: 9,
                        end_line: 12,
                        end_column: 56,
                      },
                    },
                  ],
                },
                id: 31,
                span: {
                  start_line: 12,
                  start_column: 5,
                  end_line: 12,
                  end_column: 57,
                },
              },
            ],
          },
          id: 19,
          span: {
            start_line: 11,
            start_column: 3,
            end_line: 12,
            end_column: 58,
          },
        },
        {
          expr: {
            List: [
              {
                expr: {
                  Atom: "use-trait",
                },
                id: 43,
                span: {
                  start_line: 14,
                  start_column: 2,
                  end_line: 14,
                  end_column: 10,
                },
              },
              {
                expr: {
                  Atom: "ft-trait",
                },
                id: 44,
                span: {
                  start_line: 14,
                  start_column: 12,
                  end_line: 14,
                  end_column: 19,
                },
              },
              {
                expr: {
                  Field: {
                    name: "sip-010-trait",
                    contract_identifier: {
                      issuer: [
                        22,
                        [
                          9, 159, 184, 137, 38, 216, 47, 48, 178, 244, 14, 175,
                          62, 228, 35, 203, 114, 91, 219, 59,
                        ],
                      ],
                      name: "sip-010-trait-ft-standard",
                    },
                  },
                },
                id: 45,
                span: {
                  start_line: 14,
                  start_column: 21,
                  end_line: 14,
                  end_column: 101,
                },
              },
            ],
          },
          id: 42,
          span: {
            start_line: 14,
            start_column: 1,
            end_line: 14,
            end_column: 102,
          },
        },
        {
          expr: {
            List: [
              {
                expr: {
                  Atom: "define-public",
                },
                id: 47,
                span: {
                  start_line: 16,
                  start_column: 2,
                  end_line: 16,
                  end_column: 14,
                },
              },
              {
                expr: {
                  List: [
                    {
                      expr: {
                        Atom: "test-no-trait",
                      },
                      id: 49,
                      span: {
                        start_line: 16,
                        start_column: 17,
                        end_line: 16,
                        end_column: 29,
                      },
                    },
                  ],
                },
                id: 48,
                span: {
                  start_line: 16,
                  start_column: 16,
                  end_line: 16,
                  end_column: 30,
                },
              },
              {
                expr: {
                  List: [
                    {
                      expr: {
                        Atom: "ok",
                      },
                      id: 51,
                      span: {
                        start_line: 17,
                        start_column: 4,
                        end_line: 17,
                        end_column: 5,
                      },
                    },
                    {
                      expr: {
                        Atom: "true",
                      },
                      id: 52,
                      span: {
                        start_line: 17,
                        start_column: 7,
                        end_line: 17,
                        end_column: 10,
                      },
                    },
                  ],
                },
                id: 50,
                span: {
                  start_line: 17,
                  start_column: 3,
                  end_line: 17,
                  end_column: 11,
                },
              },
            ],
          },
          id: 46,
          span: {
            start_line: 16,
            start_column: 1,
            end_line: 18,
            end_column: 1,
          },
        },
        {
          expr: {
            List: [
              {
                expr: {
                  Atom: "define-public",
                },
                id: 54,
                span: {
                  start_line: 20,
                  start_column: 2,
                  end_line: 20,
                  end_column: 14,
                },
              },
              {
                expr: {
                  List: [
                    {
                      expr: {
                        Atom: "test-trait",
                      },
                      id: 56,
                      span: {
                        start_line: 20,
                        start_column: 17,
                        end_line: 20,
                        end_column: 26,
                      },
                    },
                    {
                      expr: {
                        List: [
                          {
                            expr: {
                              Atom: "token",
                            },
                            id: 58,
                            span: {
                              start_line: 20,
                              start_column: 29,
                              end_line: 20,
                              end_column: 33,
                            },
                          },
                          {
                            expr: {
                              TraitReference: [
                                "ft-trait",
                                {
                                  Imported: {
                                    name: "sip-010-trait",
                                    contract_identifier: {
                                      issuer: [
                                        22,
                                        [
                                          9, 159, 184, 137, 38, 216, 47, 48,
                                          178, 244, 14, 175, 62, 228, 35, 203,
                                          114, 91, 219, 59,
                                        ],
                                      ],
                                      name: "sip-010-trait-ft-standard",
                                    },
                                  },
                                },
                              ],
                            },
                            id: 59,
                            span: {
                              start_line: 20,
                              start_column: 35,
                              end_line: 20,
                              end_column: 44,
                            },
                          },
                        ],
                      },
                      id: 57,
                      span: {
                        start_line: 20,
                        start_column: 28,
                        end_line: 20,
                        end_column: 45,
                      },
                    },
                  ],
                },
                id: 55,
                span: {
                  start_line: 20,
                  start_column: 16,
                  end_line: 20,
                  end_column: 46,
                },
              },
              {
                expr: {
                  List: [
                    {
                      expr: {
                        Atom: "ok",
                      },
                      id: 61,
                      span: {
                        start_line: 21,
                        start_column: 4,
                        end_line: 21,
                        end_column: 5,
                      },
                    },
                    {
                      expr: {
                        Atom: "true",
                      },
                      id: 62,
                      span: {
                        start_line: 21,
                        start_column: 7,
                        end_line: 21,
                        end_column: 10,
                      },
                    },
                  ],
                },
                id: 60,
                span: {
                  start_line: 21,
                  start_column: 3,
                  end_line: 21,
                  end_column: 11,
                },
              },
            ],
          },
          id: 53,
          span: {
            start_line: 20,
            start_column: 1,
            end_line: 22,
            end_column: 1,
          },
        },
        {
          expr: {
            List: [
              {
                expr: {
                  Atom: "define-read-only",
                },
                id: 64,
                span: {
                  start_line: 24,
                  start_column: 2,
                  end_line: 24,
                  end_column: 17,
                },
              },
              {
                expr: {
                  List: [
                    {
                      expr: {
                        Atom: "invariant-trait",
                      },
                      id: 66,
                      span: {
                        start_line: 24,
                        start_column: 20,
                        end_line: 24,
                        end_column: 34,
                      },
                    },
                    {
                      expr: {
                        List: [
                          {
                            expr: {
                              Atom: "token",
                            },
                            id: 68,
                            span: {
                              start_line: 24,
                              start_column: 37,
                              end_line: 24,
                              end_column: 41,
                            },
                          },
                          {
                            expr: {
                              TraitReference: [
                                "ft-trait",
                                {
                                  Imported: {
                                    name: "sip-010-trait",
                                    contract_identifier: {
                                      issuer: [
                                        22,
                                        [
                                          9, 159, 184, 137, 38, 216, 47, 48,
                                          178, 244, 14, 175, 62, 228, 35, 203,
                                          114, 91, 219, 59,
                                        ],
                                      ],
                                      name: "sip-010-trait-ft-standard",
                                    },
                                  },
                                },
                              ],
                            },
                            id: 69,
                            span: {
                              start_line: 24,
                              start_column: 43,
                              end_line: 24,
                              end_column: 52,
                            },
                          },
                        ],
                      },
                      id: 67,
                      span: {
                        start_line: 24,
                        start_column: 36,
                        end_line: 24,
                        end_column: 53,
                      },
                    },
                  ],
                },
                id: 65,
                span: {
                  start_line: 24,
                  start_column: 19,
                  end_line: 24,
                  end_column: 54,
                },
              },
              {
                expr: {
                  Atom: "true",
                },
                id: 70,
                span: {
                  start_line: 25,
                  start_column: 3,
                  end_line: 25,
                  end_column: 6,
                },
              },
            ],
          },
          id: 63,
          span: {
            start_line: 24,
            start_column: 1,
            end_line: 26,
            end_column: 1,
          },
        },
      ],
      top_level_expression_sorting: [0, 1, 2, 3, 4, 5, 6],
      referenced_traits: {},
      implemented_traits: [],
    },
  },
  listTraitParameter: {
    functionsInterfaces: [
      {
        name: "function",
        access: "public",
        args: [],
        outputs: {
          type: {
            response: {
              ok: "bool",
              error: "none",
            },
          },
        },
      },
      {
        name: "test-no-trait",
        access: "public",
        args: [],
        outputs: {
          type: {
            response: {
              ok: "bool",
              error: "none",
            },
          },
        },
      },
      {
        name: "test-trait",
        access: "public",
        args: [
          {
            name: "token-list",
            type: {
              list: {
                type: "trait_reference",
                length: 5,
              },
            },
          },
        ],
        outputs: {
          type: {
            response: {
              ok: "bool",
              error: "none",
            },
          },
        },
      },
      {
        name: "update-context",
        access: "public",
        args: [
          {
            name: "function-name",
            type: {
              "string-ascii": {
                length: 100,
              },
            },
          },
          {
            name: "called",
            type: "uint128",
          },
        ],
        outputs: {
          type: {
            response: {
              ok: "bool",
              error: "none",
            },
          },
        },
      },
    ],
    ast: {
      contract_identifier: {
        issuer: [
          26,
          [
            109, 120, 222, 123, 6, 37, 223, 191, 193, 108, 58, 138, 87, 53, 246,
            220, 61, 195, 242, 206,
          ],
        ],
        name: "trait-contract",
      },
      pre_expressions: [],
      expressions: [
        {
          expr: {
            List: [
              {
                expr: {
                  Atom: "define-public",
                },
                id: 2,
                span: {
                  start_line: 1,
                  start_column: 2,
                  end_line: 1,
                  end_column: 14,
                },
              },
              {
                expr: {
                  List: [
                    {
                      expr: {
                        Atom: "function",
                      },
                      id: 4,
                      span: {
                        start_line: 1,
                        start_column: 17,
                        end_line: 1,
                        end_column: 24,
                      },
                    },
                  ],
                },
                id: 3,
                span: {
                  start_line: 1,
                  start_column: 16,
                  end_line: 1,
                  end_column: 25,
                },
              },
              {
                expr: {
                  List: [
                    {
                      expr: {
                        Atom: "ok",
                      },
                      id: 6,
                      span: {
                        start_line: 2,
                        start_column: 4,
                        end_line: 2,
                        end_column: 5,
                      },
                    },
                    {
                      expr: {
                        Atom: "true",
                      },
                      id: 7,
                      span: {
                        start_line: 2,
                        start_column: 7,
                        end_line: 2,
                        end_column: 10,
                      },
                    },
                  ],
                },
                id: 5,
                span: {
                  start_line: 2,
                  start_column: 3,
                  end_line: 2,
                  end_column: 11,
                },
              },
            ],
          },
          id: 1,
          span: {
            start_line: 1,
            start_column: 1,
            end_line: 3,
            end_column: 1,
          },
        },
        {
          expr: {
            List: [
              {
                expr: {
                  Atom: "define-map",
                },
                id: 9,
                span: {
                  start_line: 6,
                  start_column: 2,
                  end_line: 6,
                  end_column: 11,
                },
              },
              {
                expr: {
                  Atom: "context",
                },
                id: 10,
                span: {
                  start_line: 6,
                  start_column: 13,
                  end_line: 6,
                  end_column: 19,
                },
              },
              {
                expr: {
                  List: [
                    {
                      expr: {
                        Atom: "string-ascii",
                      },
                      id: 12,
                      span: {
                        start_line: 6,
                        start_column: 22,
                        end_line: 6,
                        end_column: 33,
                      },
                    },
                    {
                      expr: {
                        LiteralValue: {
                          Int: "100",
                        },
                      },
                      id: 13,
                      span: {
                        start_line: 6,
                        start_column: 35,
                        end_line: 6,
                        end_column: 37,
                      },
                    },
                  ],
                },
                id: 11,
                span: {
                  start_line: 6,
                  start_column: 21,
                  end_line: 6,
                  end_column: 38,
                },
              },
              {
                expr: {
                  List: [
                    {
                      expr: {
                        Atom: "tuple",
                      },
                      id: 15,
                      span: {
                        start_line: 0,
                        start_column: 0,
                        end_line: 0,
                        end_column: 0,
                      },
                    },
                    {
                      expr: {
                        List: [
                          {
                            expr: {
                              Atom: "called",
                            },
                            id: 17,
                            span: {
                              start_line: 7,
                              start_column: 5,
                              end_line: 7,
                              end_column: 10,
                            },
                          },
                          {
                            expr: {
                              Atom: "uint",
                            },
                            id: 18,
                            span: {
                              start_line: 7,
                              start_column: 13,
                              end_line: 7,
                              end_column: 16,
                            },
                            post_comments: [
                              [
                                "other data",
                                {
                                  start_line: 8,
                                  start_column: 5,
                                  end_line: 8,
                                  end_column: 17,
                                },
                              ],
                            ],
                          },
                        ],
                      },
                      id: 16,
                      span: {
                        start_line: 7,
                        start_column: 5,
                        end_line: 7,
                        end_column: 16,
                      },
                    },
                  ],
                },
                id: 14,
                span: {
                  start_line: 6,
                  start_column: 40,
                  end_line: 9,
                  end_column: 3,
                },
              },
            ],
          },
          id: 8,
          span: {
            start_line: 6,
            start_column: 1,
            end_line: 9,
            end_column: 4,
          },
        },
        {
          expr: {
            List: [
              {
                expr: {
                  Atom: "define-public",
                },
                id: 20,
                span: {
                  start_line: 11,
                  start_column: 4,
                  end_line: 11,
                  end_column: 16,
                },
              },
              {
                expr: {
                  List: [
                    {
                      expr: {
                        Atom: "update-context",
                      },
                      id: 22,
                      span: {
                        start_line: 11,
                        start_column: 19,
                        end_line: 11,
                        end_column: 32,
                      },
                    },
                    {
                      expr: {
                        List: [
                          {
                            expr: {
                              Atom: "function-name",
                            },
                            id: 24,
                            span: {
                              start_line: 11,
                              start_column: 35,
                              end_line: 11,
                              end_column: 47,
                            },
                          },
                          {
                            expr: {
                              List: [
                                {
                                  expr: {
                                    Atom: "string-ascii",
                                  },
                                  id: 26,
                                  span: {
                                    start_line: 11,
                                    start_column: 50,
                                    end_line: 11,
                                    end_column: 61,
                                  },
                                },
                                {
                                  expr: {
                                    LiteralValue: {
                                      Int: "100",
                                    },
                                  },
                                  id: 27,
                                  span: {
                                    start_line: 11,
                                    start_column: 63,
                                    end_line: 11,
                                    end_column: 65,
                                  },
                                },
                              ],
                            },
                            id: 25,
                            span: {
                              start_line: 11,
                              start_column: 49,
                              end_line: 11,
                              end_column: 66,
                            },
                          },
                        ],
                      },
                      id: 23,
                      span: {
                        start_line: 11,
                        start_column: 34,
                        end_line: 11,
                        end_column: 67,
                      },
                    },
                    {
                      expr: {
                        List: [
                          {
                            expr: {
                              Atom: "called",
                            },
                            id: 29,
                            span: {
                              start_line: 11,
                              start_column: 70,
                              end_line: 11,
                              end_column: 75,
                            },
                          },
                          {
                            expr: {
                              Atom: "uint",
                            },
                            id: 30,
                            span: {
                              start_line: 11,
                              start_column: 77,
                              end_line: 11,
                              end_column: 80,
                            },
                          },
                        ],
                      },
                      id: 28,
                      span: {
                        start_line: 11,
                        start_column: 69,
                        end_line: 11,
                        end_column: 81,
                      },
                    },
                  ],
                },
                id: 21,
                span: {
                  start_line: 11,
                  start_column: 18,
                  end_line: 11,
                  end_column: 82,
                },
              },
              {
                expr: {
                  List: [
                    {
                      expr: {
                        Atom: "ok",
                      },
                      id: 32,
                      span: {
                        start_line: 12,
                        start_column: 6,
                        end_line: 12,
                        end_column: 7,
                      },
                    },
                    {
                      expr: {
                        List: [
                          {
                            expr: {
                              Atom: "map-set",
                            },
                            id: 34,
                            span: {
                              start_line: 12,
                              start_column: 10,
                              end_line: 12,
                              end_column: 16,
                            },
                          },
                          {
                            expr: {
                              Atom: "context",
                            },
                            id: 35,
                            span: {
                              start_line: 12,
                              start_column: 18,
                              end_line: 12,
                              end_column: 24,
                            },
                          },
                          {
                            expr: {
                              Atom: "function-name",
                            },
                            id: 36,
                            span: {
                              start_line: 12,
                              start_column: 26,
                              end_line: 12,
                              end_column: 38,
                            },
                          },
                          {
                            expr: {
                              List: [
                                {
                                  expr: {
                                    Atom: "tuple",
                                  },
                                  id: 38,
                                  span: {
                                    start_line: 0,
                                    start_column: 0,
                                    end_line: 0,
                                    end_column: 0,
                                  },
                                },
                                {
                                  expr: {
                                    List: [
                                      {
                                        expr: {
                                          Atom: "called",
                                        },
                                        id: 40,
                                        span: {
                                          start_line: 12,
                                          start_column: 41,
                                          end_line: 12,
                                          end_column: 46,
                                        },
                                      },
                                      {
                                        expr: {
                                          Atom: "called",
                                        },
                                        id: 41,
                                        span: {
                                          start_line: 12,
                                          start_column: 49,
                                          end_line: 12,
                                          end_column: 54,
                                        },
                                      },
                                    ],
                                  },
                                  id: 39,
                                  span: {
                                    start_line: 12,
                                    start_column: 41,
                                    end_line: 12,
                                    end_column: 54,
                                  },
                                },
                              ],
                            },
                            id: 37,
                            span: {
                              start_line: 12,
                              start_column: 40,
                              end_line: 12,
                              end_column: 55,
                            },
                          },
                        ],
                      },
                      id: 33,
                      span: {
                        start_line: 12,
                        start_column: 9,
                        end_line: 12,
                        end_column: 56,
                      },
                    },
                  ],
                },
                id: 31,
                span: {
                  start_line: 12,
                  start_column: 5,
                  end_line: 12,
                  end_column: 57,
                },
              },
            ],
          },
          id: 19,
          span: {
            start_line: 11,
            start_column: 3,
            end_line: 12,
            end_column: 58,
          },
        },
        {
          expr: {
            List: [
              {
                expr: {
                  Atom: "use-trait",
                },
                id: 43,
                span: {
                  start_line: 14,
                  start_column: 2,
                  end_line: 14,
                  end_column: 10,
                },
              },
              {
                expr: {
                  Atom: "ft-trait",
                },
                id: 44,
                span: {
                  start_line: 14,
                  start_column: 12,
                  end_line: 14,
                  end_column: 19,
                },
              },
              {
                expr: {
                  Field: {
                    name: "sip-010-trait",
                    contract_identifier: {
                      issuer: [
                        22,
                        [
                          9, 159, 184, 137, 38, 216, 47, 48, 178, 244, 14, 175,
                          62, 228, 35, 203, 114, 91, 219, 59,
                        ],
                      ],
                      name: "sip-010-trait-ft-standard",
                    },
                  },
                },
                id: 45,
                span: {
                  start_line: 14,
                  start_column: 21,
                  end_line: 14,
                  end_column: 101,
                },
              },
            ],
          },
          id: 42,
          span: {
            start_line: 14,
            start_column: 1,
            end_line: 14,
            end_column: 102,
          },
        },
        {
          expr: {
            List: [
              {
                expr: {
                  Atom: "define-public",
                },
                id: 47,
                span: {
                  start_line: 16,
                  start_column: 2,
                  end_line: 16,
                  end_column: 14,
                },
              },
              {
                expr: {
                  List: [
                    {
                      expr: {
                        Atom: "test-no-trait",
                      },
                      id: 49,
                      span: {
                        start_line: 16,
                        start_column: 17,
                        end_line: 16,
                        end_column: 29,
                      },
                    },
                  ],
                },
                id: 48,
                span: {
                  start_line: 16,
                  start_column: 16,
                  end_line: 16,
                  end_column: 30,
                },
              },
              {
                expr: {
                  List: [
                    {
                      expr: {
                        Atom: "ok",
                      },
                      id: 51,
                      span: {
                        start_line: 17,
                        start_column: 4,
                        end_line: 17,
                        end_column: 5,
                      },
                    },
                    {
                      expr: {
                        Atom: "true",
                      },
                      id: 52,
                      span: {
                        start_line: 17,
                        start_column: 7,
                        end_line: 17,
                        end_column: 10,
                      },
                    },
                  ],
                },
                id: 50,
                span: {
                  start_line: 17,
                  start_column: 3,
                  end_line: 17,
                  end_column: 11,
                },
              },
            ],
          },
          id: 46,
          span: {
            start_line: 16,
            start_column: 1,
            end_line: 18,
            end_column: 1,
          },
        },
        {
          expr: {
            List: [
              {
                expr: {
                  Atom: "define-public",
                },
                id: 54,
                span: {
                  start_line: 20,
                  start_column: 2,
                  end_line: 20,
                  end_column: 14,
                },
              },
              {
                expr: {
                  List: [
                    {
                      expr: {
                        Atom: "test-trait",
                      },
                      id: 56,
                      span: {
                        start_line: 20,
                        start_column: 17,
                        end_line: 20,
                        end_column: 26,
                      },
                    },
                    {
                      expr: {
                        List: [
                          {
                            expr: {
                              Atom: "token-list",
                            },
                            id: 58,
                            span: {
                              start_line: 20,
                              start_column: 29,
                              end_line: 20,
                              end_column: 38,
                            },
                          },
                          {
                            expr: {
                              List: [
                                {
                                  expr: {
                                    Atom: "list",
                                  },
                                  id: 60,
                                  span: {
                                    start_line: 20,
                                    start_column: 41,
                                    end_line: 20,
                                    end_column: 44,
                                  },
                                },
                                {
                                  expr: {
                                    LiteralValue: {
                                      Int: "5",
                                    },
                                  },
                                  id: 61,
                                  span: {
                                    start_line: 20,
                                    start_column: 46,
                                    end_line: 20,
                                    end_column: 46,
                                  },
                                },
                                {
                                  expr: {
                                    TraitReference: [
                                      "ft-trait",
                                      {
                                        Imported: {
                                          name: "sip-010-trait",
                                          contract_identifier: {
                                            issuer: [
                                              22,
                                              [
                                                9, 159, 184, 137, 38, 216, 47,
                                                48, 178, 244, 14, 175, 62, 228,
                                                35, 203, 114, 91, 219, 59,
                                              ],
                                            ],
                                            name: "sip-010-trait-ft-standard",
                                          },
                                        },
                                      },
                                    ],
                                  },
                                  id: 62,
                                  span: {
                                    start_line: 20,
                                    start_column: 48,
                                    end_line: 20,
                                    end_column: 57,
                                  },
                                },
                              ],
                            },
                            id: 59,
                            span: {
                              start_line: 20,
                              start_column: 40,
                              end_line: 20,
                              end_column: 58,
                            },
                          },
                        ],
                      },
                      id: 57,
                      span: {
                        start_line: 20,
                        start_column: 28,
                        end_line: 20,
                        end_column: 59,
                      },
                    },
                  ],
                },
                id: 55,
                span: {
                  start_line: 20,
                  start_column: 16,
                  end_line: 20,
                  end_column: 60,
                },
              },
              {
                expr: {
                  List: [
                    {
                      expr: {
                        Atom: "ok",
                      },
                      id: 64,
                      span: {
                        start_line: 21,
                        start_column: 4,
                        end_line: 21,
                        end_column: 5,
                      },
                    },
                    {
                      expr: {
                        Atom: "true",
                      },
                      id: 65,
                      span: {
                        start_line: 21,
                        start_column: 7,
                        end_line: 21,
                        end_column: 10,
                      },
                    },
                  ],
                },
                id: 63,
                span: {
                  start_line: 21,
                  start_column: 3,
                  end_line: 21,
                  end_column: 11,
                },
              },
            ],
          },
          id: 53,
          span: {
            start_line: 20,
            start_column: 1,
            end_line: 22,
            end_column: 1,
          },
        },
      ],
      top_level_expression_sorting: [0, 1, 2, 3, 4, 5],
      referenced_traits: {},
      implemented_traits: [],
    },
  },
  tupleTraitParameter: {
    functionsInterfaces: [
      {
        name: "function",
        access: "public",
        args: [],
        outputs: {
          type: {
            response: {
              ok: "bool",
              error: "none",
            },
          },
        },
      },
      {
        name: "test-no-trait",
        access: "public",
        args: [],
        outputs: {
          type: {
            response: {
              ok: "bool",
              error: "none",
            },
          },
        },
      },
      {
        name: "test-trait",
        access: "public",
        args: [
          {
            name: "tuple-param",
            type: {
              tuple: [
                {
                  name: "token",
                  type: "trait_reference",
                },
              ],
            },
          },
        ],
        outputs: {
          type: {
            response: {
              ok: "bool",
              error: "none",
            },
          },
        },
      },
      {
        name: "update-context",
        access: "public",
        args: [
          {
            name: "function-name",
            type: {
              "string-ascii": {
                length: 100,
              },
            },
          },
          {
            name: "called",
            type: "uint128",
          },
        ],
        outputs: {
          type: {
            response: {
              ok: "bool",
              error: "none",
            },
          },
        },
      },
    ],
    ast: {
      contract_identifier: {
        issuer: [
          26,
          [
            109, 120, 222, 123, 6, 37, 223, 191, 193, 108, 58, 138, 87, 53, 246,
            220, 61, 195, 242, 206,
          ],
        ],
        name: "trait-contract",
      },
      pre_expressions: [],
      expressions: [
        {
          expr: {
            List: [
              {
                expr: {
                  Atom: "define-public",
                },
                id: 2,
                span: {
                  start_line: 1,
                  start_column: 2,
                  end_line: 1,
                  end_column: 14,
                },
              },
              {
                expr: {
                  List: [
                    {
                      expr: {
                        Atom: "function",
                      },
                      id: 4,
                      span: {
                        start_line: 1,
                        start_column: 17,
                        end_line: 1,
                        end_column: 24,
                      },
                    },
                  ],
                },
                id: 3,
                span: {
                  start_line: 1,
                  start_column: 16,
                  end_line: 1,
                  end_column: 25,
                },
              },
              {
                expr: {
                  List: [
                    {
                      expr: {
                        Atom: "ok",
                      },
                      id: 6,
                      span: {
                        start_line: 2,
                        start_column: 4,
                        end_line: 2,
                        end_column: 5,
                      },
                    },
                    {
                      expr: {
                        Atom: "true",
                      },
                      id: 7,
                      span: {
                        start_line: 2,
                        start_column: 7,
                        end_line: 2,
                        end_column: 10,
                      },
                    },
                  ],
                },
                id: 5,
                span: {
                  start_line: 2,
                  start_column: 3,
                  end_line: 2,
                  end_column: 11,
                },
              },
            ],
          },
          id: 1,
          span: {
            start_line: 1,
            start_column: 1,
            end_line: 3,
            end_column: 1,
          },
        },
        {
          expr: {
            List: [
              {
                expr: {
                  Atom: "define-map",
                },
                id: 9,
                span: {
                  start_line: 6,
                  start_column: 2,
                  end_line: 6,
                  end_column: 11,
                },
              },
              {
                expr: {
                  Atom: "context",
                },
                id: 10,
                span: {
                  start_line: 6,
                  start_column: 13,
                  end_line: 6,
                  end_column: 19,
                },
              },
              {
                expr: {
                  List: [
                    {
                      expr: {
                        Atom: "string-ascii",
                      },
                      id: 12,
                      span: {
                        start_line: 6,
                        start_column: 22,
                        end_line: 6,
                        end_column: 33,
                      },
                    },
                    {
                      expr: {
                        LiteralValue: {
                          Int: "100",
                        },
                      },
                      id: 13,
                      span: {
                        start_line: 6,
                        start_column: 35,
                        end_line: 6,
                        end_column: 37,
                      },
                    },
                  ],
                },
                id: 11,
                span: {
                  start_line: 6,
                  start_column: 21,
                  end_line: 6,
                  end_column: 38,
                },
              },
              {
                expr: {
                  List: [
                    {
                      expr: {
                        Atom: "tuple",
                      },
                      id: 15,
                      span: {
                        start_line: 0,
                        start_column: 0,
                        end_line: 0,
                        end_column: 0,
                      },
                    },
                    {
                      expr: {
                        List: [
                          {
                            expr: {
                              Atom: "called",
                            },
                            id: 17,
                            span: {
                              start_line: 7,
                              start_column: 5,
                              end_line: 7,
                              end_column: 10,
                            },
                          },
                          {
                            expr: {
                              Atom: "uint",
                            },
                            id: 18,
                            span: {
                              start_line: 7,
                              start_column: 13,
                              end_line: 7,
                              end_column: 16,
                            },
                            post_comments: [
                              [
                                "other data",
                                {
                                  start_line: 8,
                                  start_column: 5,
                                  end_line: 8,
                                  end_column: 17,
                                },
                              ],
                            ],
                          },
                        ],
                      },
                      id: 16,
                      span: {
                        start_line: 7,
                        start_column: 5,
                        end_line: 7,
                        end_column: 16,
                      },
                    },
                  ],
                },
                id: 14,
                span: {
                  start_line: 6,
                  start_column: 40,
                  end_line: 9,
                  end_column: 3,
                },
              },
            ],
          },
          id: 8,
          span: {
            start_line: 6,
            start_column: 1,
            end_line: 9,
            end_column: 4,
          },
        },
        {
          expr: {
            List: [
              {
                expr: {
                  Atom: "define-public",
                },
                id: 20,
                span: {
                  start_line: 11,
                  start_column: 4,
                  end_line: 11,
                  end_column: 16,
                },
              },
              {
                expr: {
                  List: [
                    {
                      expr: {
                        Atom: "update-context",
                      },
                      id: 22,
                      span: {
                        start_line: 11,
                        start_column: 19,
                        end_line: 11,
                        end_column: 32,
                      },
                    },
                    {
                      expr: {
                        List: [
                          {
                            expr: {
                              Atom: "function-name",
                            },
                            id: 24,
                            span: {
                              start_line: 11,
                              start_column: 35,
                              end_line: 11,
                              end_column: 47,
                            },
                          },
                          {
                            expr: {
                              List: [
                                {
                                  expr: {
                                    Atom: "string-ascii",
                                  },
                                  id: 26,
                                  span: {
                                    start_line: 11,
                                    start_column: 50,
                                    end_line: 11,
                                    end_column: 61,
                                  },
                                },
                                {
                                  expr: {
                                    LiteralValue: {
                                      Int: "100",
                                    },
                                  },
                                  id: 27,
                                  span: {
                                    start_line: 11,
                                    start_column: 63,
                                    end_line: 11,
                                    end_column: 65,
                                  },
                                },
                              ],
                            },
                            id: 25,
                            span: {
                              start_line: 11,
                              start_column: 49,
                              end_line: 11,
                              end_column: 66,
                            },
                          },
                        ],
                      },
                      id: 23,
                      span: {
                        start_line: 11,
                        start_column: 34,
                        end_line: 11,
                        end_column: 67,
                      },
                    },
                    {
                      expr: {
                        List: [
                          {
                            expr: {
                              Atom: "called",
                            },
                            id: 29,
                            span: {
                              start_line: 11,
                              start_column: 70,
                              end_line: 11,
                              end_column: 75,
                            },
                          },
                          {
                            expr: {
                              Atom: "uint",
                            },
                            id: 30,
                            span: {
                              start_line: 11,
                              start_column: 77,
                              end_line: 11,
                              end_column: 80,
                            },
                          },
                        ],
                      },
                      id: 28,
                      span: {
                        start_line: 11,
                        start_column: 69,
                        end_line: 11,
                        end_column: 81,
                      },
                    },
                  ],
                },
                id: 21,
                span: {
                  start_line: 11,
                  start_column: 18,
                  end_line: 11,
                  end_column: 82,
                },
              },
              {
                expr: {
                  List: [
                    {
                      expr: {
                        Atom: "ok",
                      },
                      id: 32,
                      span: {
                        start_line: 12,
                        start_column: 6,
                        end_line: 12,
                        end_column: 7,
                      },
                    },
                    {
                      expr: {
                        List: [
                          {
                            expr: {
                              Atom: "map-set",
                            },
                            id: 34,
                            span: {
                              start_line: 12,
                              start_column: 10,
                              end_line: 12,
                              end_column: 16,
                            },
                          },
                          {
                            expr: {
                              Atom: "context",
                            },
                            id: 35,
                            span: {
                              start_line: 12,
                              start_column: 18,
                              end_line: 12,
                              end_column: 24,
                            },
                          },
                          {
                            expr: {
                              Atom: "function-name",
                            },
                            id: 36,
                            span: {
                              start_line: 12,
                              start_column: 26,
                              end_line: 12,
                              end_column: 38,
                            },
                          },
                          {
                            expr: {
                              List: [
                                {
                                  expr: {
                                    Atom: "tuple",
                                  },
                                  id: 38,
                                  span: {
                                    start_line: 0,
                                    start_column: 0,
                                    end_line: 0,
                                    end_column: 0,
                                  },
                                },
                                {
                                  expr: {
                                    List: [
                                      {
                                        expr: {
                                          Atom: "called",
                                        },
                                        id: 40,
                                        span: {
                                          start_line: 12,
                                          start_column: 41,
                                          end_line: 12,
                                          end_column: 46,
                                        },
                                      },
                                      {
                                        expr: {
                                          Atom: "called",
                                        },
                                        id: 41,
                                        span: {
                                          start_line: 12,
                                          start_column: 49,
                                          end_line: 12,
                                          end_column: 54,
                                        },
                                      },
                                    ],
                                  },
                                  id: 39,
                                  span: {
                                    start_line: 12,
                                    start_column: 41,
                                    end_line: 12,
                                    end_column: 54,
                                  },
                                },
                              ],
                            },
                            id: 37,
                            span: {
                              start_line: 12,
                              start_column: 40,
                              end_line: 12,
                              end_column: 55,
                            },
                          },
                        ],
                      },
                      id: 33,
                      span: {
                        start_line: 12,
                        start_column: 9,
                        end_line: 12,
                        end_column: 56,
                      },
                    },
                  ],
                },
                id: 31,
                span: {
                  start_line: 12,
                  start_column: 5,
                  end_line: 12,
                  end_column: 57,
                },
              },
            ],
          },
          id: 19,
          span: {
            start_line: 11,
            start_column: 3,
            end_line: 12,
            end_column: 58,
          },
        },
        {
          expr: {
            List: [
              {
                expr: {
                  Atom: "use-trait",
                },
                id: 43,
                span: {
                  start_line: 14,
                  start_column: 2,
                  end_line: 14,
                  end_column: 10,
                },
              },
              {
                expr: {
                  Atom: "ft-trait",
                },
                id: 44,
                span: {
                  start_line: 14,
                  start_column: 12,
                  end_line: 14,
                  end_column: 19,
                },
              },
              {
                expr: {
                  Field: {
                    name: "sip-010-trait",
                    contract_identifier: {
                      issuer: [
                        22,
                        [
                          9, 159, 184, 137, 38, 216, 47, 48, 178, 244, 14, 175,
                          62, 228, 35, 203, 114, 91, 219, 59,
                        ],
                      ],
                      name: "sip-010-trait-ft-standard",
                    },
                  },
                },
                id: 45,
                span: {
                  start_line: 14,
                  start_column: 21,
                  end_line: 14,
                  end_column: 101,
                },
              },
            ],
          },
          id: 42,
          span: {
            start_line: 14,
            start_column: 1,
            end_line: 14,
            end_column: 102,
          },
        },
        {
          expr: {
            List: [
              {
                expr: {
                  Atom: "define-public",
                },
                id: 47,
                span: {
                  start_line: 16,
                  start_column: 2,
                  end_line: 16,
                  end_column: 14,
                },
              },
              {
                expr: {
                  List: [
                    {
                      expr: {
                        Atom: "test-no-trait",
                      },
                      id: 49,
                      span: {
                        start_line: 16,
                        start_column: 17,
                        end_line: 16,
                        end_column: 29,
                      },
                    },
                  ],
                },
                id: 48,
                span: {
                  start_line: 16,
                  start_column: 16,
                  end_line: 16,
                  end_column: 30,
                },
              },
              {
                expr: {
                  List: [
                    {
                      expr: {
                        Atom: "ok",
                      },
                      id: 51,
                      span: {
                        start_line: 17,
                        start_column: 4,
                        end_line: 17,
                        end_column: 5,
                      },
                    },
                    {
                      expr: {
                        Atom: "true",
                      },
                      id: 52,
                      span: {
                        start_line: 17,
                        start_column: 7,
                        end_line: 17,
                        end_column: 10,
                      },
                    },
                  ],
                },
                id: 50,
                span: {
                  start_line: 17,
                  start_column: 3,
                  end_line: 17,
                  end_column: 11,
                },
              },
            ],
          },
          id: 46,
          span: {
            start_line: 16,
            start_column: 1,
            end_line: 18,
            end_column: 1,
          },
        },
        {
          expr: {
            List: [
              {
                expr: {
                  Atom: "define-public",
                },
                id: 54,
                span: {
                  start_line: 20,
                  start_column: 2,
                  end_line: 20,
                  end_column: 14,
                },
              },
              {
                expr: {
                  List: [
                    {
                      expr: {
                        Atom: "test-trait",
                      },
                      id: 56,
                      span: {
                        start_line: 20,
                        start_column: 17,
                        end_line: 20,
                        end_column: 26,
                      },
                    },
                    {
                      expr: {
                        List: [
                          {
                            expr: {
                              Atom: "tuple-param",
                            },
                            id: 58,
                            span: {
                              start_line: 20,
                              start_column: 29,
                              end_line: 20,
                              end_column: 39,
                            },
                          },
                          {
                            expr: {
                              List: [
                                {
                                  expr: {
                                    Atom: "tuple",
                                  },
                                  id: 60,
                                  span: {
                                    start_line: 0,
                                    start_column: 0,
                                    end_line: 0,
                                    end_column: 0,
                                  },
                                },
                                {
                                  expr: {
                                    List: [
                                      {
                                        expr: {
                                          Atom: "token",
                                        },
                                        id: 62,
                                        span: {
                                          start_line: 20,
                                          start_column: 42,
                                          end_line: 20,
                                          end_column: 46,
                                        },
                                      },
                                      {
                                        expr: {
                                          TraitReference: [
                                            "ft-trait",
                                            {
                                              Imported: {
                                                name: "sip-010-trait",
                                                contract_identifier: {
                                                  issuer: [
                                                    22,
                                                    [
                                                      9, 159, 184, 137, 38, 216,
                                                      47, 48, 178, 244, 14, 175,
                                                      62, 228, 35, 203, 114, 91,
                                                      219, 59,
                                                    ],
                                                  ],
                                                  name: "sip-010-trait-ft-standard",
                                                },
                                              },
                                            },
                                          ],
                                        },
                                        id: 63,
                                        span: {
                                          start_line: 20,
                                          start_column: 49,
                                          end_line: 20,
                                          end_column: 58,
                                        },
                                      },
                                    ],
                                  },
                                  id: 61,
                                  span: {
                                    start_line: 20,
                                    start_column: 42,
                                    end_line: 20,
                                    end_column: 58,
                                  },
                                },
                              ],
                            },
                            id: 59,
                            span: {
                              start_line: 20,
                              start_column: 41,
                              end_line: 20,
                              end_column: 59,
                            },
                          },
                        ],
                      },
                      id: 57,
                      span: {
                        start_line: 20,
                        start_column: 28,
                        end_line: 20,
                        end_column: 60,
                      },
                    },
                  ],
                },
                id: 55,
                span: {
                  start_line: 20,
                  start_column: 16,
                  end_line: 20,
                  end_column: 61,
                },
              },
              {
                expr: {
                  List: [
                    {
                      expr: {
                        Atom: "ok",
                      },
                      id: 65,
                      span: {
                        start_line: 21,
                        start_column: 4,
                        end_line: 21,
                        end_column: 5,
                      },
                    },
                    {
                      expr: {
                        Atom: "true",
                      },
                      id: 66,
                      span: {
                        start_line: 21,
                        start_column: 7,
                        end_line: 21,
                        end_column: 10,
                      },
                    },
                  ],
                },
                id: 64,
                span: {
                  start_line: 21,
                  start_column: 3,
                  end_line: 21,
                  end_column: 11,
                },
              },
            ],
          },
          id: 53,
          span: {
            start_line: 20,
            start_column: 1,
            end_line: 22,
            end_column: 1,
          },
        },
      ],
      top_level_expression_sorting: [0, 1, 2, 3, 4, 5],
      referenced_traits: {},
      implemented_traits: [],
    },
  },
  tupleTraitParameterFollowedByNonTraitTupleParameter: {
    functionsInterfaces: [
      {
        name: "create",
        access: "public",
        args: [
          {
            name: "request-details",
            type: {
              tuple: [
                {
                  name: "token-x-trait",
                  type: "trait_reference",
                },
                {
                  name: "token-y-trait",
                  type: "trait_reference",
                },
              ],
            },
          },
          {
            name: "verify-params",
            type: {
              tuple: [
                {
                  name: "proof",
                  type: {
                    tuple: [
                      {
                        name: "tx-index",
                        type: "uint128",
                      },
                    ],
                  },
                },
              ],
            },
          },
        ],
        outputs: {
          type: {
            response: {
              ok: "bool",
              error: "none",
            },
          },
        },
      },
    ],
    ast: {
      contract_identifier: {
        issuer: [
          26,
          [
            109, 120, 222, 123, 6, 37, 223, 191, 193, 108, 58, 138, 87, 53, 246,
            220, 61, 195, 242, 206,
          ],
        ],
        name: "trait-contract",
      },
      pre_expressions: [],
      expressions: [
        {
          expr: {
            List: [
              {
                expr: {
                  Atom: "use-trait",
                },
                id: 2,
                span: {
                  start_line: 1,
                  start_column: 2,
                  end_line: 1,
                  end_column: 10,
                },
              },
              {
                expr: {
                  Atom: "ft-trait",
                },
                id: 3,
                span: {
                  start_line: 1,
                  start_column: 12,
                  end_line: 1,
                  end_column: 19,
                },
              },
              {
                expr: {
                  Field: {
                    name: "sip-010-trait",
                    contract_identifier: {
                      issuer: [
                        22,
                        [
                          64, 45, 162, 192, 121, 229, 211, 29, 88, 185, 207,
                          199, 40, 109, 27, 30, 178, 247, 131, 78,
                        ],
                      ],
                      name: "trait-sip-010",
                    },
                  },
                },
                id: 4,
                span: {
                  start_line: 1,
                  start_column: 21,
                  end_line: 1,
                  end_column: 90,
                },
              },
            ],
          },
          id: 1,
          span: {
            start_line: 1,
            start_column: 1,
            end_line: 1,
            end_column: 91,
          },
        },
        {
          expr: {
            List: [
              {
                expr: {
                  Atom: "define-public",
                },
                id: 6,
                span: {
                  start_line: 3,
                  start_column: 2,
                  end_line: 3,
                  end_column: 14,
                },
              },
              {
                expr: {
                  List: [
                    {
                      expr: {
                        Atom: "create",
                      },
                      id: 8,
                      span: {
                        start_line: 3,
                        start_column: 17,
                        end_line: 3,
                        end_column: 22,
                      },
                    },
                    {
                      expr: {
                        List: [
                          {
                            expr: {
                              Atom: "request-details",
                            },
                            id: 10,
                            span: {
                              start_line: 4,
                              start_column: 6,
                              end_line: 4,
                              end_column: 20,
                            },
                          },
                          {
                            expr: {
                              List: [
                                {
                                  expr: {
                                    Atom: "tuple",
                                  },
                                  id: 12,
                                  span: {
                                    start_line: 0,
                                    start_column: 0,
                                    end_line: 0,
                                    end_column: 0,
                                  },
                                },
                                {
                                  expr: {
                                    List: [
                                      {
                                        expr: {
                                          Atom: "token-x-trait",
                                        },
                                        id: 14,
                                        span: {
                                          start_line: 5,
                                          start_column: 9,
                                          end_line: 5,
                                          end_column: 21,
                                        },
                                      },
                                      {
                                        expr: {
                                          TraitReference: [
                                            "ft-trait",
                                            {
                                              Imported: {
                                                name: "sip-010-trait",
                                                contract_identifier: {
                                                  issuer: [
                                                    22,
                                                    [
                                                      64, 45, 162, 192, 121,
                                                      229, 211, 29, 88, 185,
                                                      207, 199, 40, 109, 27, 30,
                                                      178, 247, 131, 78,
                                                    ],
                                                  ],
                                                  name: "trait-sip-010",
                                                },
                                              },
                                            },
                                          ],
                                        },
                                        id: 15,
                                        span: {
                                          start_line: 5,
                                          start_column: 24,
                                          end_line: 5,
                                          end_column: 33,
                                        },
                                      },
                                    ],
                                  },
                                  id: 13,
                                  span: {
                                    start_line: 5,
                                    start_column: 9,
                                    end_line: 5,
                                    end_column: 33,
                                  },
                                },
                                {
                                  expr: {
                                    List: [
                                      {
                                        expr: {
                                          Atom: "token-y-trait",
                                        },
                                        id: 17,
                                        span: {
                                          start_line: 5,
                                          start_column: 36,
                                          end_line: 5,
                                          end_column: 48,
                                        },
                                      },
                                      {
                                        expr: {
                                          TraitReference: [
                                            "ft-trait",
                                            {
                                              Imported: {
                                                name: "sip-010-trait",
                                                contract_identifier: {
                                                  issuer: [
                                                    22,
                                                    [
                                                      64, 45, 162, 192, 121,
                                                      229, 211, 29, 88, 185,
                                                      207, 199, 40, 109, 27, 30,
                                                      178, 247, 131, 78,
                                                    ],
                                                  ],
                                                  name: "trait-sip-010",
                                                },
                                              },
                                            },
                                          ],
                                        },
                                        id: 18,
                                        span: {
                                          start_line: 5,
                                          start_column: 51,
                                          end_line: 5,
                                          end_column: 60,
                                        },
                                      },
                                    ],
                                  },
                                  id: 16,
                                  span: {
                                    start_line: 5,
                                    start_column: 36,
                                    end_line: 5,
                                    end_column: 60,
                                  },
                                },
                              ],
                            },
                            id: 11,
                            span: {
                              start_line: 4,
                              start_column: 22,
                              end_line: 6,
                              end_column: 7,
                            },
                          },
                        ],
                      },
                      id: 9,
                      span: {
                        start_line: 4,
                        start_column: 5,
                        end_line: 7,
                        end_column: 5,
                      },
                    },
                    {
                      expr: {
                        List: [
                          {
                            expr: {
                              Atom: "verify-params",
                            },
                            id: 20,
                            span: {
                              start_line: 8,
                              start_column: 4,
                              end_line: 8,
                              end_column: 16,
                            },
                          },
                          {
                            expr: {
                              List: [
                                {
                                  expr: {
                                    Atom: "tuple",
                                  },
                                  id: 22,
                                  span: {
                                    start_line: 0,
                                    start_column: 0,
                                    end_line: 0,
                                    end_column: 0,
                                  },
                                },
                                {
                                  expr: {
                                    List: [
                                      {
                                        expr: {
                                          Atom: "proof",
                                        },
                                        id: 24,
                                        span: {
                                          start_line: 9,
                                          start_column: 6,
                                          end_line: 9,
                                          end_column: 10,
                                        },
                                      },
                                      {
                                        expr: {
                                          List: [
                                            {
                                              expr: {
                                                Atom: "tuple",
                                              },
                                              id: 26,
                                              span: {
                                                start_line: 0,
                                                start_column: 0,
                                                end_line: 0,
                                                end_column: 0,
                                              },
                                            },
                                            {
                                              expr: {
                                                List: [
                                                  {
                                                    expr: {
                                                      Atom: "tx-index",
                                                    },
                                                    id: 28,
                                                    span: {
                                                      start_line: 9,
                                                      start_column: 15,
                                                      end_line: 9,
                                                      end_column: 22,
                                                    },
                                                  },
                                                  {
                                                    expr: {
                                                      Atom: "uint",
                                                    },
                                                    id: 29,
                                                    span: {
                                                      start_line: 9,
                                                      start_column: 25,
                                                      end_line: 9,
                                                      end_column: 28,
                                                    },
                                                  },
                                                ],
                                              },
                                              id: 27,
                                              span: {
                                                start_line: 9,
                                                start_column: 15,
                                                end_line: 9,
                                                end_column: 28,
                                              },
                                            },
                                          ],
                                        },
                                        id: 25,
                                        span: {
                                          start_line: 9,
                                          start_column: 13,
                                          end_line: 9,
                                          end_column: 30,
                                        },
                                      },
                                    ],
                                  },
                                  id: 23,
                                  span: {
                                    start_line: 9,
                                    start_column: 6,
                                    end_line: 9,
                                    end_column: 30,
                                  },
                                },
                              ],
                            },
                            id: 21,
                            span: {
                              start_line: 8,
                              start_column: 18,
                              end_line: 10,
                              end_column: 7,
                            },
                          },
                        ],
                      },
                      id: 19,
                      span: {
                        start_line: 8,
                        start_column: 3,
                        end_line: 11,
                        end_column: 5,
                      },
                    },
                  ],
                },
                id: 7,
                span: {
                  start_line: 3,
                  start_column: 16,
                  end_line: 12,
                  end_column: 3,
                },
              },
              {
                expr: {
                  List: [
                    {
                      expr: {
                        Atom: "ok",
                      },
                      id: 31,
                      span: {
                        start_line: 13,
                        start_column: 4,
                        end_line: 13,
                        end_column: 5,
                      },
                    },
                    {
                      expr: {
                        Atom: "true",
                      },
                      id: 32,
                      span: {
                        start_line: 13,
                        start_column: 7,
                        end_line: 13,
                        end_column: 10,
                      },
                    },
                  ],
                },
                id: 30,
                span: {
                  start_line: 13,
                  start_column: 3,
                  end_line: 13,
                  end_column: 11,
                },
              },
            ],
          },
          id: 5,
          span: {
            start_line: 3,
            start_column: 1,
            end_line: 14,
            end_column: 1,
          },
        },
        {
          expr: {
            List: [
              {
                expr: {
                  Atom: "define-map",
                },
                id: 34,
                span: {
                  start_line: 16,
                  start_column: 2,
                  end_line: 16,
                  end_column: 11,
                },
              },
              {
                expr: {
                  Atom: "context",
                },
                id: 35,
                span: {
                  start_line: 16,
                  start_column: 13,
                  end_line: 16,
                  end_column: 19,
                },
              },
              {
                expr: {
                  List: [
                    {
                      expr: {
                        Atom: "string-ascii",
                      },
                      id: 37,
                      span: {
                        start_line: 16,
                        start_column: 22,
                        end_line: 16,
                        end_column: 33,
                      },
                    },
                    {
                      expr: {
                        LiteralValue: {
                          Int: "100",
                        },
                      },
                      id: 38,
                      span: {
                        start_line: 16,
                        start_column: 35,
                        end_line: 16,
                        end_column: 37,
                      },
                    },
                  ],
                },
                id: 36,
                span: {
                  start_line: 16,
                  start_column: 21,
                  end_line: 16,
                  end_column: 38,
                },
              },
              {
                expr: {
                  List: [
                    {
                      expr: {
                        Atom: "tuple",
                      },
                      id: 40,
                      span: {
                        start_line: 0,
                        start_column: 0,
                        end_line: 0,
                        end_column: 0,
                      },
                    },
                    {
                      expr: {
                        List: [
                          {
                            expr: {
                              Atom: "called",
                            },
                            id: 42,
                            span: {
                              start_line: 17,
                              start_column: 5,
                              end_line: 17,
                              end_column: 10,
                            },
                          },
                          {
                            expr: {
                              Atom: "uint",
                            },
                            id: 43,
                            span: {
                              start_line: 17,
                              start_column: 13,
                              end_line: 17,
                              end_column: 16,
                            },
                            post_comments: [
                              [
                                "other data",
                                {
                                  start_line: 18,
                                  start_column: 5,
                                  end_line: 18,
                                  end_column: 17,
                                },
                              ],
                            ],
                          },
                        ],
                      },
                      id: 41,
                      span: {
                        start_line: 17,
                        start_column: 5,
                        end_line: 17,
                        end_column: 16,
                      },
                    },
                  ],
                },
                id: 39,
                span: {
                  start_line: 16,
                  start_column: 40,
                  end_line: 19,
                  end_column: 3,
                },
              },
            ],
          },
          id: 33,
          span: {
            start_line: 16,
            start_column: 1,
            end_line: 19,
            end_column: 4,
          },
        },
        {
          expr: {
            List: [
              {
                expr: {
                  Atom: "define-public",
                },
                id: 45,
                span: {
                  start_line: 21,
                  start_column: 4,
                  end_line: 21,
                  end_column: 16,
                },
              },
              {
                expr: {
                  List: [
                    {
                      expr: {
                        Atom: "update-context",
                      },
                      id: 47,
                      span: {
                        start_line: 21,
                        start_column: 19,
                        end_line: 21,
                        end_column: 32,
                      },
                    },
                    {
                      expr: {
                        List: [
                          {
                            expr: {
                              Atom: "function-name",
                            },
                            id: 49,
                            span: {
                              start_line: 21,
                              start_column: 35,
                              end_line: 21,
                              end_column: 47,
                            },
                          },
                          {
                            expr: {
                              List: [
                                {
                                  expr: {
                                    Atom: "string-ascii",
                                  },
                                  id: 51,
                                  span: {
                                    start_line: 21,
                                    start_column: 50,
                                    end_line: 21,
                                    end_column: 61,
                                  },
                                },
                                {
                                  expr: {
                                    LiteralValue: {
                                      Int: "100",
                                    },
                                  },
                                  id: 52,
                                  span: {
                                    start_line: 21,
                                    start_column: 63,
                                    end_line: 21,
                                    end_column: 65,
                                  },
                                },
                              ],
                            },
                            id: 50,
                            span: {
                              start_line: 21,
                              start_column: 49,
                              end_line: 21,
                              end_column: 66,
                            },
                          },
                        ],
                      },
                      id: 48,
                      span: {
                        start_line: 21,
                        start_column: 34,
                        end_line: 21,
                        end_column: 67,
                      },
                    },
                    {
                      expr: {
                        List: [
                          {
                            expr: {
                              Atom: "called",
                            },
                            id: 54,
                            span: {
                              start_line: 21,
                              start_column: 70,
                              end_line: 21,
                              end_column: 75,
                            },
                          },
                          {
                            expr: {
                              Atom: "uint",
                            },
                            id: 55,
                            span: {
                              start_line: 21,
                              start_column: 77,
                              end_line: 21,
                              end_column: 80,
                            },
                          },
                        ],
                      },
                      id: 53,
                      span: {
                        start_line: 21,
                        start_column: 69,
                        end_line: 21,
                        end_column: 81,
                      },
                    },
                  ],
                },
                id: 46,
                span: {
                  start_line: 21,
                  start_column: 18,
                  end_line: 21,
                  end_column: 82,
                },
              },
              {
                expr: {
                  List: [
                    {
                      expr: {
                        Atom: "ok",
                      },
                      id: 57,
                      span: {
                        start_line: 22,
                        start_column: 6,
                        end_line: 22,
                        end_column: 7,
                      },
                    },
                    {
                      expr: {
                        List: [
                          {
                            expr: {
                              Atom: "map-set",
                            },
                            id: 59,
                            span: {
                              start_line: 22,
                              start_column: 10,
                              end_line: 22,
                              end_column: 16,
                            },
                          },
                          {
                            expr: {
                              Atom: "context",
                            },
                            id: 60,
                            span: {
                              start_line: 22,
                              start_column: 18,
                              end_line: 22,
                              end_column: 24,
                            },
                          },
                          {
                            expr: {
                              Atom: "function-name",
                            },
                            id: 61,
                            span: {
                              start_line: 22,
                              start_column: 26,
                              end_line: 22,
                              end_column: 38,
                            },
                          },
                          {
                            expr: {
                              List: [
                                {
                                  expr: {
                                    Atom: "tuple",
                                  },
                                  id: 63,
                                  span: {
                                    start_line: 0,
                                    start_column: 0,
                                    end_line: 0,
                                    end_column: 0,
                                  },
                                },
                                {
                                  expr: {
                                    List: [
                                      {
                                        expr: {
                                          Atom: "called",
                                        },
                                        id: 65,
                                        span: {
                                          start_line: 22,
                                          start_column: 41,
                                          end_line: 22,
                                          end_column: 46,
                                        },
                                      },
                                      {
                                        expr: {
                                          Atom: "called",
                                        },
                                        id: 66,
                                        span: {
                                          start_line: 22,
                                          start_column: 49,
                                          end_line: 22,
                                          end_column: 54,
                                        },
                                      },
                                    ],
                                  },
                                  id: 64,
                                  span: {
                                    start_line: 22,
                                    start_column: 41,
                                    end_line: 22,
                                    end_column: 54,
                                  },
                                },
                              ],
                            },
                            id: 62,
                            span: {
                              start_line: 22,
                              start_column: 40,
                              end_line: 22,
                              end_column: 55,
                            },
                          },
                        ],
                      },
                      id: 58,
                      span: {
                        start_line: 22,
                        start_column: 9,
                        end_line: 22,
                        end_column: 56,
                      },
                    },
                  ],
                },
                id: 56,
                span: {
                  start_line: 22,
                  start_column: 5,
                  end_line: 22,
                  end_column: 57,
                },
              },
            ],
          },
          id: 44,
          span: {
            start_line: 21,
            start_column: 3,
            end_line: 22,
            end_column: 58,
          },
        },
        {
          expr: {
            List: [
              {
                expr: {
                  Atom: "define-read-only",
                },
                id: 68,
                span: {
                  start_line: 24,
                  start_column: 2,
                  end_line: 24,
                  end_column: 17,
                },
              },
              {
                expr: {
                  List: [
                    {
                      expr: {
                        Atom: "invariant-empty",
                      },
                      id: 70,
                      span: {
                        start_line: 24,
                        start_column: 20,
                        end_line: 24,
                        end_column: 34,
                      },
                    },
                  ],
                },
                id: 69,
                span: {
                  start_line: 24,
                  start_column: 19,
                  end_line: 24,
                  end_column: 35,
                },
              },
              {
                expr: {
                  Atom: "true",
                },
                id: 71,
                span: {
                  start_line: 25,
                  start_column: 3,
                  end_line: 25,
                  end_column: 6,
                },
              },
            ],
          },
          id: 67,
          span: {
            start_line: 24,
            start_column: 1,
            end_line: 26,
            end_column: 1,
          },
        },
      ],
      top_level_expression_sorting: [0, 1, 2, 3, 4],
      referenced_traits: {},
      implemented_traits: [],
    },
  },
  responseOkTraitParameter: {
    functionsInterfaces: [
      {
        name: "function",
        access: "public",
        args: [],
        outputs: {
          type: {
            response: {
              ok: "bool",
              error: "none",
            },
          },
        },
      },
      {
        name: "test-no-trait",
        access: "public",
        args: [],
        outputs: {
          type: {
            response: {
              ok: "bool",
              error: "none",
            },
          },
        },
      },
      {
        name: "test-trait",
        access: "public",
        args: [
          {
            name: "resp-trait-param",
            type: {
              response: {
                ok: "trait_reference",
                error: "uint128",
              },
            },
          },
        ],
        outputs: {
          type: {
            response: {
              ok: "bool",
              error: "none",
            },
          },
        },
      },
      {
        name: "update-context",
        access: "public",
        args: [
          {
            name: "function-name",
            type: {
              "string-ascii": {
                length: 100,
              },
            },
          },
          {
            name: "called",
            type: "uint128",
          },
        ],
        outputs: {
          type: {
            response: {
              ok: "bool",
              error: "none",
            },
          },
        },
      },
    ],
    ast: {
      contract_identifier: {
        issuer: [
          26,
          [
            109, 120, 222, 123, 6, 37, 223, 191, 193, 108, 58, 138, 87, 53, 246,
            220, 61, 195, 242, 206,
          ],
        ],
        name: "trait-contract",
      },
      pre_expressions: [],
      expressions: [
        {
          expr: {
            List: [
              {
                expr: {
                  Atom: "define-public",
                },
                id: 2,
                span: {
                  start_line: 1,
                  start_column: 2,
                  end_line: 1,
                  end_column: 14,
                },
              },
              {
                expr: {
                  List: [
                    {
                      expr: {
                        Atom: "function",
                      },
                      id: 4,
                      span: {
                        start_line: 1,
                        start_column: 17,
                        end_line: 1,
                        end_column: 24,
                      },
                    },
                  ],
                },
                id: 3,
                span: {
                  start_line: 1,
                  start_column: 16,
                  end_line: 1,
                  end_column: 25,
                },
              },
              {
                expr: {
                  List: [
                    {
                      expr: {
                        Atom: "ok",
                      },
                      id: 6,
                      span: {
                        start_line: 2,
                        start_column: 4,
                        end_line: 2,
                        end_column: 5,
                      },
                    },
                    {
                      expr: {
                        Atom: "true",
                      },
                      id: 7,
                      span: {
                        start_line: 2,
                        start_column: 7,
                        end_line: 2,
                        end_column: 10,
                      },
                    },
                  ],
                },
                id: 5,
                span: {
                  start_line: 2,
                  start_column: 3,
                  end_line: 2,
                  end_column: 11,
                },
              },
            ],
          },
          id: 1,
          span: {
            start_line: 1,
            start_column: 1,
            end_line: 3,
            end_column: 1,
          },
        },
        {
          expr: {
            List: [
              {
                expr: {
                  Atom: "define-map",
                },
                id: 9,
                span: {
                  start_line: 6,
                  start_column: 2,
                  end_line: 6,
                  end_column: 11,
                },
              },
              {
                expr: {
                  Atom: "context",
                },
                id: 10,
                span: {
                  start_line: 6,
                  start_column: 13,
                  end_line: 6,
                  end_column: 19,
                },
              },
              {
                expr: {
                  List: [
                    {
                      expr: {
                        Atom: "string-ascii",
                      },
                      id: 12,
                      span: {
                        start_line: 6,
                        start_column: 22,
                        end_line: 6,
                        end_column: 33,
                      },
                    },
                    {
                      expr: {
                        LiteralValue: {
                          Int: "100",
                        },
                      },
                      id: 13,
                      span: {
                        start_line: 6,
                        start_column: 35,
                        end_line: 6,
                        end_column: 37,
                      },
                    },
                  ],
                },
                id: 11,
                span: {
                  start_line: 6,
                  start_column: 21,
                  end_line: 6,
                  end_column: 38,
                },
              },
              {
                expr: {
                  List: [
                    {
                      expr: {
                        Atom: "tuple",
                      },
                      id: 15,
                      span: {
                        start_line: 0,
                        start_column: 0,
                        end_line: 0,
                        end_column: 0,
                      },
                    },
                    {
                      expr: {
                        List: [
                          {
                            expr: {
                              Atom: "called",
                            },
                            id: 17,
                            span: {
                              start_line: 7,
                              start_column: 5,
                              end_line: 7,
                              end_column: 10,
                            },
                          },
                          {
                            expr: {
                              Atom: "uint",
                            },
                            id: 18,
                            span: {
                              start_line: 7,
                              start_column: 13,
                              end_line: 7,
                              end_column: 16,
                            },
                            post_comments: [
                              [
                                "other data",
                                {
                                  start_line: 8,
                                  start_column: 5,
                                  end_line: 8,
                                  end_column: 17,
                                },
                              ],
                            ],
                          },
                        ],
                      },
                      id: 16,
                      span: {
                        start_line: 7,
                        start_column: 5,
                        end_line: 7,
                        end_column: 16,
                      },
                    },
                  ],
                },
                id: 14,
                span: {
                  start_line: 6,
                  start_column: 40,
                  end_line: 9,
                  end_column: 3,
                },
              },
            ],
          },
          id: 8,
          span: {
            start_line: 6,
            start_column: 1,
            end_line: 9,
            end_column: 4,
          },
        },
        {
          expr: {
            List: [
              {
                expr: {
                  Atom: "define-public",
                },
                id: 20,
                span: {
                  start_line: 11,
                  start_column: 4,
                  end_line: 11,
                  end_column: 16,
                },
              },
              {
                expr: {
                  List: [
                    {
                      expr: {
                        Atom: "update-context",
                      },
                      id: 22,
                      span: {
                        start_line: 11,
                        start_column: 19,
                        end_line: 11,
                        end_column: 32,
                      },
                    },
                    {
                      expr: {
                        List: [
                          {
                            expr: {
                              Atom: "function-name",
                            },
                            id: 24,
                            span: {
                              start_line: 11,
                              start_column: 35,
                              end_line: 11,
                              end_column: 47,
                            },
                          },
                          {
                            expr: {
                              List: [
                                {
                                  expr: {
                                    Atom: "string-ascii",
                                  },
                                  id: 26,
                                  span: {
                                    start_line: 11,
                                    start_column: 50,
                                    end_line: 11,
                                    end_column: 61,
                                  },
                                },
                                {
                                  expr: {
                                    LiteralValue: {
                                      Int: "100",
                                    },
                                  },
                                  id: 27,
                                  span: {
                                    start_line: 11,
                                    start_column: 63,
                                    end_line: 11,
                                    end_column: 65,
                                  },
                                },
                              ],
                            },
                            id: 25,
                            span: {
                              start_line: 11,
                              start_column: 49,
                              end_line: 11,
                              end_column: 66,
                            },
                          },
                        ],
                      },
                      id: 23,
                      span: {
                        start_line: 11,
                        start_column: 34,
                        end_line: 11,
                        end_column: 67,
                      },
                    },
                    {
                      expr: {
                        List: [
                          {
                            expr: {
                              Atom: "called",
                            },
                            id: 29,
                            span: {
                              start_line: 11,
                              start_column: 70,
                              end_line: 11,
                              end_column: 75,
                            },
                          },
                          {
                            expr: {
                              Atom: "uint",
                            },
                            id: 30,
                            span: {
                              start_line: 11,
                              start_column: 77,
                              end_line: 11,
                              end_column: 80,
                            },
                          },
                        ],
                      },
                      id: 28,
                      span: {
                        start_line: 11,
                        start_column: 69,
                        end_line: 11,
                        end_column: 81,
                      },
                    },
                  ],
                },
                id: 21,
                span: {
                  start_line: 11,
                  start_column: 18,
                  end_line: 11,
                  end_column: 82,
                },
              },
              {
                expr: {
                  List: [
                    {
                      expr: {
                        Atom: "ok",
                      },
                      id: 32,
                      span: {
                        start_line: 12,
                        start_column: 6,
                        end_line: 12,
                        end_column: 7,
                      },
                    },
                    {
                      expr: {
                        List: [
                          {
                            expr: {
                              Atom: "map-set",
                            },
                            id: 34,
                            span: {
                              start_line: 12,
                              start_column: 10,
                              end_line: 12,
                              end_column: 16,
                            },
                          },
                          {
                            expr: {
                              Atom: "context",
                            },
                            id: 35,
                            span: {
                              start_line: 12,
                              start_column: 18,
                              end_line: 12,
                              end_column: 24,
                            },
                          },
                          {
                            expr: {
                              Atom: "function-name",
                            },
                            id: 36,
                            span: {
                              start_line: 12,
                              start_column: 26,
                              end_line: 12,
                              end_column: 38,
                            },
                          },
                          {
                            expr: {
                              List: [
                                {
                                  expr: {
                                    Atom: "tuple",
                                  },
                                  id: 38,
                                  span: {
                                    start_line: 0,
                                    start_column: 0,
                                    end_line: 0,
                                    end_column: 0,
                                  },
                                },
                                {
                                  expr: {
                                    List: [
                                      {
                                        expr: {
                                          Atom: "called",
                                        },
                                        id: 40,
                                        span: {
                                          start_line: 12,
                                          start_column: 41,
                                          end_line: 12,
                                          end_column: 46,
                                        },
                                      },
                                      {
                                        expr: {
                                          Atom: "called",
                                        },
                                        id: 41,
                                        span: {
                                          start_line: 12,
                                          start_column: 49,
                                          end_line: 12,
                                          end_column: 54,
                                        },
                                      },
                                    ],
                                  },
                                  id: 39,
                                  span: {
                                    start_line: 12,
                                    start_column: 41,
                                    end_line: 12,
                                    end_column: 54,
                                  },
                                },
                              ],
                            },
                            id: 37,
                            span: {
                              start_line: 12,
                              start_column: 40,
                              end_line: 12,
                              end_column: 55,
                            },
                          },
                        ],
                      },
                      id: 33,
                      span: {
                        start_line: 12,
                        start_column: 9,
                        end_line: 12,
                        end_column: 56,
                      },
                    },
                  ],
                },
                id: 31,
                span: {
                  start_line: 12,
                  start_column: 5,
                  end_line: 12,
                  end_column: 57,
                },
              },
            ],
          },
          id: 19,
          span: {
            start_line: 11,
            start_column: 3,
            end_line: 12,
            end_column: 58,
          },
        },
        {
          expr: {
            List: [
              {
                expr: {
                  Atom: "use-trait",
                },
                id: 43,
                span: {
                  start_line: 14,
                  start_column: 2,
                  end_line: 14,
                  end_column: 10,
                },
              },
              {
                expr: {
                  Atom: "ft-trait",
                },
                id: 44,
                span: {
                  start_line: 14,
                  start_column: 12,
                  end_line: 14,
                  end_column: 19,
                },
              },
              {
                expr: {
                  Field: {
                    name: "sip-010-trait",
                    contract_identifier: {
                      issuer: [
                        22,
                        [
                          9, 159, 184, 137, 38, 216, 47, 48, 178, 244, 14, 175,
                          62, 228, 35, 203, 114, 91, 219, 59,
                        ],
                      ],
                      name: "sip-010-trait-ft-standard",
                    },
                  },
                },
                id: 45,
                span: {
                  start_line: 14,
                  start_column: 21,
                  end_line: 14,
                  end_column: 101,
                },
              },
            ],
          },
          id: 42,
          span: {
            start_line: 14,
            start_column: 1,
            end_line: 14,
            end_column: 102,
          },
        },
        {
          expr: {
            List: [
              {
                expr: {
                  Atom: "define-public",
                },
                id: 47,
                span: {
                  start_line: 16,
                  start_column: 2,
                  end_line: 16,
                  end_column: 14,
                },
              },
              {
                expr: {
                  List: [
                    {
                      expr: {
                        Atom: "test-no-trait",
                      },
                      id: 49,
                      span: {
                        start_line: 16,
                        start_column: 17,
                        end_line: 16,
                        end_column: 29,
                      },
                    },
                  ],
                },
                id: 48,
                span: {
                  start_line: 16,
                  start_column: 16,
                  end_line: 16,
                  end_column: 30,
                },
              },
              {
                expr: {
                  List: [
                    {
                      expr: {
                        Atom: "ok",
                      },
                      id: 51,
                      span: {
                        start_line: 17,
                        start_column: 4,
                        end_line: 17,
                        end_column: 5,
                      },
                    },
                    {
                      expr: {
                        Atom: "true",
                      },
                      id: 52,
                      span: {
                        start_line: 17,
                        start_column: 7,
                        end_line: 17,
                        end_column: 10,
                      },
                    },
                  ],
                },
                id: 50,
                span: {
                  start_line: 17,
                  start_column: 3,
                  end_line: 17,
                  end_column: 11,
                },
              },
            ],
          },
          id: 46,
          span: {
            start_line: 16,
            start_column: 1,
            end_line: 18,
            end_column: 1,
          },
        },
        {
          expr: {
            List: [
              {
                expr: {
                  Atom: "define-public",
                },
                id: 54,
                span: {
                  start_line: 20,
                  start_column: 2,
                  end_line: 20,
                  end_column: 14,
                },
              },
              {
                expr: {
                  List: [
                    {
                      expr: {
                        Atom: "test-trait",
                      },
                      id: 56,
                      span: {
                        start_line: 20,
                        start_column: 17,
                        end_line: 20,
                        end_column: 26,
                      },
                    },
                    {
                      expr: {
                        List: [
                          {
                            expr: {
                              Atom: "resp-trait-param",
                            },
                            id: 58,
                            span: {
                              start_line: 20,
                              start_column: 29,
                              end_line: 20,
                              end_column: 44,
                            },
                          },
                          {
                            expr: {
                              List: [
                                {
                                  expr: {
                                    Atom: "response",
                                  },
                                  id: 60,
                                  span: {
                                    start_line: 20,
                                    start_column: 47,
                                    end_line: 20,
                                    end_column: 54,
                                  },
                                },
                                {
                                  expr: {
                                    TraitReference: [
                                      "ft-trait",
                                      {
                                        Imported: {
                                          name: "sip-010-trait",
                                          contract_identifier: {
                                            issuer: [
                                              22,
                                              [
                                                9, 159, 184, 137, 38, 216, 47,
                                                48, 178, 244, 14, 175, 62, 228,
                                                35, 203, 114, 91, 219, 59,
                                              ],
                                            ],
                                            name: "sip-010-trait-ft-standard",
                                          },
                                        },
                                      },
                                    ],
                                  },
                                  id: 61,
                                  span: {
                                    start_line: 20,
                                    start_column: 56,
                                    end_line: 20,
                                    end_column: 65,
                                  },
                                },
                                {
                                  expr: {
                                    Atom: "uint",
                                  },
                                  id: 62,
                                  span: {
                                    start_line: 20,
                                    start_column: 67,
                                    end_line: 20,
                                    end_column: 70,
                                  },
                                },
                              ],
                            },
                            id: 59,
                            span: {
                              start_line: 20,
                              start_column: 46,
                              end_line: 20,
                              end_column: 71,
                            },
                          },
                        ],
                      },
                      id: 57,
                      span: {
                        start_line: 20,
                        start_column: 28,
                        end_line: 20,
                        end_column: 72,
                      },
                    },
                  ],
                },
                id: 55,
                span: {
                  start_line: 20,
                  start_column: 16,
                  end_line: 20,
                  end_column: 73,
                },
              },
              {
                expr: {
                  List: [
                    {
                      expr: {
                        Atom: "ok",
                      },
                      id: 64,
                      span: {
                        start_line: 21,
                        start_column: 4,
                        end_line: 21,
                        end_column: 5,
                      },
                    },
                    {
                      expr: {
                        Atom: "true",
                      },
                      id: 65,
                      span: {
                        start_line: 21,
                        start_column: 7,
                        end_line: 21,
                        end_column: 10,
                      },
                    },
                  ],
                },
                id: 63,
                span: {
                  start_line: 21,
                  start_column: 3,
                  end_line: 21,
                  end_column: 11,
                },
              },
            ],
          },
          id: 53,
          span: {
            start_line: 20,
            start_column: 1,
            end_line: 22,
            end_column: 1,
          },
        },
      ],
      top_level_expression_sorting: [0, 1, 2, 3, 4, 5],
      referenced_traits: {},
      implemented_traits: [],
    },
  },
  responseErrTraitParameter: {
    functionsInterfaces: [
      {
        name: "function",
        access: "public",
        args: [],
        outputs: {
          type: {
            response: {
              ok: "bool",
              error: "none",
            },
          },
        },
      },
      {
        name: "test-no-trait",
        access: "public",
        args: [],
        outputs: {
          type: {
            response: {
              ok: "bool",
              error: "none",
            },
          },
        },
      },
      {
        name: "test-trait",
        access: "public",
        args: [
          {
            name: "resp-trait-param",
            type: {
              response: {
                ok: "uint128",
                error: "trait_reference",
              },
            },
          },
        ],
        outputs: {
          type: {
            response: {
              ok: "bool",
              error: "none",
            },
          },
        },
      },
      {
        name: "update-context",
        access: "public",
        args: [
          {
            name: "function-name",
            type: {
              "string-ascii": {
                length: 100,
              },
            },
          },
          {
            name: "called",
            type: "uint128",
          },
        ],
        outputs: {
          type: {
            response: {
              ok: "bool",
              error: "none",
            },
          },
        },
      },
    ],
    ast: {
      contract_identifier: {
        issuer: [
          26,
          [
            109, 120, 222, 123, 6, 37, 223, 191, 193, 108, 58, 138, 87, 53, 246,
            220, 61, 195, 242, 206,
          ],
        ],
        name: "trait-contract",
      },
      pre_expressions: [],
      expressions: [
        {
          expr: {
            List: [
              {
                expr: {
                  Atom: "define-public",
                },
                id: 2,
                span: {
                  start_line: 1,
                  start_column: 2,
                  end_line: 1,
                  end_column: 14,
                },
              },
              {
                expr: {
                  List: [
                    {
                      expr: {
                        Atom: "function",
                      },
                      id: 4,
                      span: {
                        start_line: 1,
                        start_column: 17,
                        end_line: 1,
                        end_column: 24,
                      },
                    },
                  ],
                },
                id: 3,
                span: {
                  start_line: 1,
                  start_column: 16,
                  end_line: 1,
                  end_column: 25,
                },
              },
              {
                expr: {
                  List: [
                    {
                      expr: {
                        Atom: "ok",
                      },
                      id: 6,
                      span: {
                        start_line: 2,
                        start_column: 4,
                        end_line: 2,
                        end_column: 5,
                      },
                    },
                    {
                      expr: {
                        Atom: "true",
                      },
                      id: 7,
                      span: {
                        start_line: 2,
                        start_column: 7,
                        end_line: 2,
                        end_column: 10,
                      },
                    },
                  ],
                },
                id: 5,
                span: {
                  start_line: 2,
                  start_column: 3,
                  end_line: 2,
                  end_column: 11,
                },
              },
            ],
          },
          id: 1,
          span: {
            start_line: 1,
            start_column: 1,
            end_line: 3,
            end_column: 1,
          },
        },
        {
          expr: {
            List: [
              {
                expr: {
                  Atom: "define-map",
                },
                id: 9,
                span: {
                  start_line: 6,
                  start_column: 2,
                  end_line: 6,
                  end_column: 11,
                },
              },
              {
                expr: {
                  Atom: "context",
                },
                id: 10,
                span: {
                  start_line: 6,
                  start_column: 13,
                  end_line: 6,
                  end_column: 19,
                },
              },
              {
                expr: {
                  List: [
                    {
                      expr: {
                        Atom: "string-ascii",
                      },
                      id: 12,
                      span: {
                        start_line: 6,
                        start_column: 22,
                        end_line: 6,
                        end_column: 33,
                      },
                    },
                    {
                      expr: {
                        LiteralValue: {
                          Int: "100",
                        },
                      },
                      id: 13,
                      span: {
                        start_line: 6,
                        start_column: 35,
                        end_line: 6,
                        end_column: 37,
                      },
                    },
                  ],
                },
                id: 11,
                span: {
                  start_line: 6,
                  start_column: 21,
                  end_line: 6,
                  end_column: 38,
                },
              },
              {
                expr: {
                  List: [
                    {
                      expr: {
                        Atom: "tuple",
                      },
                      id: 15,
                      span: {
                        start_line: 0,
                        start_column: 0,
                        end_line: 0,
                        end_column: 0,
                      },
                    },
                    {
                      expr: {
                        List: [
                          {
                            expr: {
                              Atom: "called",
                            },
                            id: 17,
                            span: {
                              start_line: 7,
                              start_column: 5,
                              end_line: 7,
                              end_column: 10,
                            },
                          },
                          {
                            expr: {
                              Atom: "uint",
                            },
                            id: 18,
                            span: {
                              start_line: 7,
                              start_column: 13,
                              end_line: 7,
                              end_column: 16,
                            },
                            post_comments: [
                              [
                                "other data",
                                {
                                  start_line: 8,
                                  start_column: 5,
                                  end_line: 8,
                                  end_column: 17,
                                },
                              ],
                            ],
                          },
                        ],
                      },
                      id: 16,
                      span: {
                        start_line: 7,
                        start_column: 5,
                        end_line: 7,
                        end_column: 16,
                      },
                    },
                  ],
                },
                id: 14,
                span: {
                  start_line: 6,
                  start_column: 40,
                  end_line: 9,
                  end_column: 3,
                },
              },
            ],
          },
          id: 8,
          span: {
            start_line: 6,
            start_column: 1,
            end_line: 9,
            end_column: 4,
          },
        },
        {
          expr: {
            List: [
              {
                expr: {
                  Atom: "define-public",
                },
                id: 20,
                span: {
                  start_line: 11,
                  start_column: 4,
                  end_line: 11,
                  end_column: 16,
                },
              },
              {
                expr: {
                  List: [
                    {
                      expr: {
                        Atom: "update-context",
                      },
                      id: 22,
                      span: {
                        start_line: 11,
                        start_column: 19,
                        end_line: 11,
                        end_column: 32,
                      },
                    },
                    {
                      expr: {
                        List: [
                          {
                            expr: {
                              Atom: "function-name",
                            },
                            id: 24,
                            span: {
                              start_line: 11,
                              start_column: 35,
                              end_line: 11,
                              end_column: 47,
                            },
                          },
                          {
                            expr: {
                              List: [
                                {
                                  expr: {
                                    Atom: "string-ascii",
                                  },
                                  id: 26,
                                  span: {
                                    start_line: 11,
                                    start_column: 50,
                                    end_line: 11,
                                    end_column: 61,
                                  },
                                },
                                {
                                  expr: {
                                    LiteralValue: {
                                      Int: "100",
                                    },
                                  },
                                  id: 27,
                                  span: {
                                    start_line: 11,
                                    start_column: 63,
                                    end_line: 11,
                                    end_column: 65,
                                  },
                                },
                              ],
                            },
                            id: 25,
                            span: {
                              start_line: 11,
                              start_column: 49,
                              end_line: 11,
                              end_column: 66,
                            },
                          },
                        ],
                      },
                      id: 23,
                      span: {
                        start_line: 11,
                        start_column: 34,
                        end_line: 11,
                        end_column: 67,
                      },
                    },
                    {
                      expr: {
                        List: [
                          {
                            expr: {
                              Atom: "called",
                            },
                            id: 29,
                            span: {
                              start_line: 11,
                              start_column: 70,
                              end_line: 11,
                              end_column: 75,
                            },
                          },
                          {
                            expr: {
                              Atom: "uint",
                            },
                            id: 30,
                            span: {
                              start_line: 11,
                              start_column: 77,
                              end_line: 11,
                              end_column: 80,
                            },
                          },
                        ],
                      },
                      id: 28,
                      span: {
                        start_line: 11,
                        start_column: 69,
                        end_line: 11,
                        end_column: 81,
                      },
                    },
                  ],
                },
                id: 21,
                span: {
                  start_line: 11,
                  start_column: 18,
                  end_line: 11,
                  end_column: 82,
                },
              },
              {
                expr: {
                  List: [
                    {
                      expr: {
                        Atom: "ok",
                      },
                      id: 32,
                      span: {
                        start_line: 12,
                        start_column: 6,
                        end_line: 12,
                        end_column: 7,
                      },
                    },
                    {
                      expr: {
                        List: [
                          {
                            expr: {
                              Atom: "map-set",
                            },
                            id: 34,
                            span: {
                              start_line: 12,
                              start_column: 10,
                              end_line: 12,
                              end_column: 16,
                            },
                          },
                          {
                            expr: {
                              Atom: "context",
                            },
                            id: 35,
                            span: {
                              start_line: 12,
                              start_column: 18,
                              end_line: 12,
                              end_column: 24,
                            },
                          },
                          {
                            expr: {
                              Atom: "function-name",
                            },
                            id: 36,
                            span: {
                              start_line: 12,
                              start_column: 26,
                              end_line: 12,
                              end_column: 38,
                            },
                          },
                          {
                            expr: {
                              List: [
                                {
                                  expr: {
                                    Atom: "tuple",
                                  },
                                  id: 38,
                                  span: {
                                    start_line: 0,
                                    start_column: 0,
                                    end_line: 0,
                                    end_column: 0,
                                  },
                                },
                                {
                                  expr: {
                                    List: [
                                      {
                                        expr: {
                                          Atom: "called",
                                        },
                                        id: 40,
                                        span: {
                                          start_line: 12,
                                          start_column: 41,
                                          end_line: 12,
                                          end_column: 46,
                                        },
                                      },
                                      {
                                        expr: {
                                          Atom: "called",
                                        },
                                        id: 41,
                                        span: {
                                          start_line: 12,
                                          start_column: 49,
                                          end_line: 12,
                                          end_column: 54,
                                        },
                                      },
                                    ],
                                  },
                                  id: 39,
                                  span: {
                                    start_line: 12,
                                    start_column: 41,
                                    end_line: 12,
                                    end_column: 54,
                                  },
                                },
                              ],
                            },
                            id: 37,
                            span: {
                              start_line: 12,
                              start_column: 40,
                              end_line: 12,
                              end_column: 55,
                            },
                          },
                        ],
                      },
                      id: 33,
                      span: {
                        start_line: 12,
                        start_column: 9,
                        end_line: 12,
                        end_column: 56,
                      },
                    },
                  ],
                },
                id: 31,
                span: {
                  start_line: 12,
                  start_column: 5,
                  end_line: 12,
                  end_column: 57,
                },
              },
            ],
          },
          id: 19,
          span: {
            start_line: 11,
            start_column: 3,
            end_line: 12,
            end_column: 58,
          },
        },
        {
          expr: {
            List: [
              {
                expr: {
                  Atom: "use-trait",
                },
                id: 43,
                span: {
                  start_line: 14,
                  start_column: 2,
                  end_line: 14,
                  end_column: 10,
                },
              },
              {
                expr: {
                  Atom: "ft-trait",
                },
                id: 44,
                span: {
                  start_line: 14,
                  start_column: 12,
                  end_line: 14,
                  end_column: 19,
                },
              },
              {
                expr: {
                  Field: {
                    name: "sip-010-trait",
                    contract_identifier: {
                      issuer: [
                        22,
                        [
                          9, 159, 184, 137, 38, 216, 47, 48, 178, 244, 14, 175,
                          62, 228, 35, 203, 114, 91, 219, 59,
                        ],
                      ],
                      name: "sip-010-trait-ft-standard",
                    },
                  },
                },
                id: 45,
                span: {
                  start_line: 14,
                  start_column: 21,
                  end_line: 14,
                  end_column: 101,
                },
              },
            ],
          },
          id: 42,
          span: {
            start_line: 14,
            start_column: 1,
            end_line: 14,
            end_column: 102,
          },
        },
        {
          expr: {
            List: [
              {
                expr: {
                  Atom: "define-public",
                },
                id: 47,
                span: {
                  start_line: 16,
                  start_column: 2,
                  end_line: 16,
                  end_column: 14,
                },
              },
              {
                expr: {
                  List: [
                    {
                      expr: {
                        Atom: "test-no-trait",
                      },
                      id: 49,
                      span: {
                        start_line: 16,
                        start_column: 17,
                        end_line: 16,
                        end_column: 29,
                      },
                    },
                  ],
                },
                id: 48,
                span: {
                  start_line: 16,
                  start_column: 16,
                  end_line: 16,
                  end_column: 30,
                },
              },
              {
                expr: {
                  List: [
                    {
                      expr: {
                        Atom: "ok",
                      },
                      id: 51,
                      span: {
                        start_line: 17,
                        start_column: 4,
                        end_line: 17,
                        end_column: 5,
                      },
                    },
                    {
                      expr: {
                        Atom: "true",
                      },
                      id: 52,
                      span: {
                        start_line: 17,
                        start_column: 7,
                        end_line: 17,
                        end_column: 10,
                      },
                    },
                  ],
                },
                id: 50,
                span: {
                  start_line: 17,
                  start_column: 3,
                  end_line: 17,
                  end_column: 11,
                },
              },
            ],
          },
          id: 46,
          span: {
            start_line: 16,
            start_column: 1,
            end_line: 18,
            end_column: 1,
          },
        },
        {
          expr: {
            List: [
              {
                expr: {
                  Atom: "define-public",
                },
                id: 54,
                span: {
                  start_line: 20,
                  start_column: 2,
                  end_line: 20,
                  end_column: 14,
                },
              },
              {
                expr: {
                  List: [
                    {
                      expr: {
                        Atom: "test-trait",
                      },
                      id: 56,
                      span: {
                        start_line: 20,
                        start_column: 17,
                        end_line: 20,
                        end_column: 26,
                      },
                    },
                    {
                      expr: {
                        List: [
                          {
                            expr: {
                              Atom: "resp-trait-param",
                            },
                            id: 58,
                            span: {
                              start_line: 20,
                              start_column: 29,
                              end_line: 20,
                              end_column: 44,
                            },
                          },
                          {
                            expr: {
                              List: [
                                {
                                  expr: {
                                    Atom: "response",
                                  },
                                  id: 60,
                                  span: {
                                    start_line: 20,
                                    start_column: 47,
                                    end_line: 20,
                                    end_column: 54,
                                  },
                                },
                                {
                                  expr: {
                                    Atom: "uint",
                                  },
                                  id: 61,
                                  span: {
                                    start_line: 20,
                                    start_column: 56,
                                    end_line: 20,
                                    end_column: 59,
                                  },
                                },
                                {
                                  expr: {
                                    TraitReference: [
                                      "ft-trait",
                                      {
                                        Imported: {
                                          name: "sip-010-trait",
                                          contract_identifier: {
                                            issuer: [
                                              22,
                                              [
                                                9, 159, 184, 137, 38, 216, 47,
                                                48, 178, 244, 14, 175, 62, 228,
                                                35, 203, 114, 91, 219, 59,
                                              ],
                                            ],
                                            name: "sip-010-trait-ft-standard",
                                          },
                                        },
                                      },
                                    ],
                                  },
                                  id: 62,
                                  span: {
                                    start_line: 20,
                                    start_column: 61,
                                    end_line: 20,
                                    end_column: 70,
                                  },
                                },
                              ],
                            },
                            id: 59,
                            span: {
                              start_line: 20,
                              start_column: 46,
                              end_line: 20,
                              end_column: 71,
                            },
                          },
                        ],
                      },
                      id: 57,
                      span: {
                        start_line: 20,
                        start_column: 28,
                        end_line: 20,
                        end_column: 72,
                      },
                    },
                  ],
                },
                id: 55,
                span: {
                  start_line: 20,
                  start_column: 16,
                  end_line: 20,
                  end_column: 73,
                },
              },
              {
                expr: {
                  List: [
                    {
                      expr: {
                        Atom: "ok",
                      },
                      id: 64,
                      span: {
                        start_line: 21,
                        start_column: 4,
                        end_line: 21,
                        end_column: 5,
                      },
                    },
                    {
                      expr: {
                        Atom: "true",
                      },
                      id: 65,
                      span: {
                        start_line: 21,
                        start_column: 7,
                        end_line: 21,
                        end_column: 10,
                      },
                    },
                  ],
                },
                id: 63,
                span: {
                  start_line: 21,
                  start_column: 3,
                  end_line: 21,
                  end_column: 11,
                },
              },
            ],
          },
          id: 53,
          span: {
            start_line: 20,
            start_column: 1,
            end_line: 22,
            end_column: 1,
          },
        },
      ],
      top_level_expression_sorting: [0, 1, 2, 3, 4, 5],
      referenced_traits: {},
      implemented_traits: [],
    },
  },
  responseBothTraitParameter: {
    functionsInterfaces: [
      {
        name: "function",
        access: "public",
        args: [],
        outputs: {
          type: {
            response: {
              ok: "bool",
              error: "none",
            },
          },
        },
      },
      {
        name: "test-no-trait",
        access: "public",
        args: [],
        outputs: {
          type: {
            response: {
              ok: "bool",
              error: "none",
            },
          },
        },
      },
      {
        name: "test-trait",
        access: "public",
        args: [
          {
            name: "resp-trait-param",
            type: {
              response: {
                ok: "trait_reference",
                error: "trait_reference",
              },
            },
          },
        ],
        outputs: {
          type: {
            response: {
              ok: "bool",
              error: "none",
            },
          },
        },
      },
      {
        name: "update-context",
        access: "public",
        args: [
          {
            name: "function-name",
            type: {
              "string-ascii": {
                length: 100,
              },
            },
          },
          {
            name: "called",
            type: "uint128",
          },
        ],
        outputs: {
          type: {
            response: {
              ok: "bool",
              error: "none",
            },
          },
        },
      },
    ],
    ast: {
      contract_identifier: {
        issuer: [
          26,
          [
            109, 120, 222, 123, 6, 37, 223, 191, 193, 108, 58, 138, 87, 53, 246,
            220, 61, 195, 242, 206,
          ],
        ],
        name: "trait-contract",
      },
      pre_expressions: [],
      expressions: [
        {
          expr: {
            List: [
              {
                expr: {
                  Atom: "define-public",
                },
                id: 2,
                span: {
                  start_line: 1,
                  start_column: 2,
                  end_line: 1,
                  end_column: 14,
                },
              },
              {
                expr: {
                  List: [
                    {
                      expr: {
                        Atom: "function",
                      },
                      id: 4,
                      span: {
                        start_line: 1,
                        start_column: 17,
                        end_line: 1,
                        end_column: 24,
                      },
                    },
                  ],
                },
                id: 3,
                span: {
                  start_line: 1,
                  start_column: 16,
                  end_line: 1,
                  end_column: 25,
                },
              },
              {
                expr: {
                  List: [
                    {
                      expr: {
                        Atom: "ok",
                      },
                      id: 6,
                      span: {
                        start_line: 2,
                        start_column: 4,
                        end_line: 2,
                        end_column: 5,
                      },
                    },
                    {
                      expr: {
                        Atom: "true",
                      },
                      id: 7,
                      span: {
                        start_line: 2,
                        start_column: 7,
                        end_line: 2,
                        end_column: 10,
                      },
                    },
                  ],
                },
                id: 5,
                span: {
                  start_line: 2,
                  start_column: 3,
                  end_line: 2,
                  end_column: 11,
                },
              },
            ],
          },
          id: 1,
          span: {
            start_line: 1,
            start_column: 1,
            end_line: 3,
            end_column: 1,
          },
        },
        {
          expr: {
            List: [
              {
                expr: {
                  Atom: "define-map",
                },
                id: 9,
                span: {
                  start_line: 6,
                  start_column: 2,
                  end_line: 6,
                  end_column: 11,
                },
              },
              {
                expr: {
                  Atom: "context",
                },
                id: 10,
                span: {
                  start_line: 6,
                  start_column: 13,
                  end_line: 6,
                  end_column: 19,
                },
              },
              {
                expr: {
                  List: [
                    {
                      expr: {
                        Atom: "string-ascii",
                      },
                      id: 12,
                      span: {
                        start_line: 6,
                        start_column: 22,
                        end_line: 6,
                        end_column: 33,
                      },
                    },
                    {
                      expr: {
                        LiteralValue: {
                          Int: "100",
                        },
                      },
                      id: 13,
                      span: {
                        start_line: 6,
                        start_column: 35,
                        end_line: 6,
                        end_column: 37,
                      },
                    },
                  ],
                },
                id: 11,
                span: {
                  start_line: 6,
                  start_column: 21,
                  end_line: 6,
                  end_column: 38,
                },
              },
              {
                expr: {
                  List: [
                    {
                      expr: {
                        Atom: "tuple",
                      },
                      id: 15,
                      span: {
                        start_line: 0,
                        start_column: 0,
                        end_line: 0,
                        end_column: 0,
                      },
                    },
                    {
                      expr: {
                        List: [
                          {
                            expr: {
                              Atom: "called",
                            },
                            id: 17,
                            span: {
                              start_line: 7,
                              start_column: 5,
                              end_line: 7,
                              end_column: 10,
                            },
                          },
                          {
                            expr: {
                              Atom: "uint",
                            },
                            id: 18,
                            span: {
                              start_line: 7,
                              start_column: 13,
                              end_line: 7,
                              end_column: 16,
                            },
                            post_comments: [
                              [
                                "other data",
                                {
                                  start_line: 8,
                                  start_column: 5,
                                  end_line: 8,
                                  end_column: 17,
                                },
                              ],
                            ],
                          },
                        ],
                      },
                      id: 16,
                      span: {
                        start_line: 7,
                        start_column: 5,
                        end_line: 7,
                        end_column: 16,
                      },
                    },
                  ],
                },
                id: 14,
                span: {
                  start_line: 6,
                  start_column: 40,
                  end_line: 9,
                  end_column: 3,
                },
              },
            ],
          },
          id: 8,
          span: {
            start_line: 6,
            start_column: 1,
            end_line: 9,
            end_column: 4,
          },
        },
        {
          expr: {
            List: [
              {
                expr: {
                  Atom: "define-public",
                },
                id: 20,
                span: {
                  start_line: 11,
                  start_column: 4,
                  end_line: 11,
                  end_column: 16,
                },
              },
              {
                expr: {
                  List: [
                    {
                      expr: {
                        Atom: "update-context",
                      },
                      id: 22,
                      span: {
                        start_line: 11,
                        start_column: 19,
                        end_line: 11,
                        end_column: 32,
                      },
                    },
                    {
                      expr: {
                        List: [
                          {
                            expr: {
                              Atom: "function-name",
                            },
                            id: 24,
                            span: {
                              start_line: 11,
                              start_column: 35,
                              end_line: 11,
                              end_column: 47,
                            },
                          },
                          {
                            expr: {
                              List: [
                                {
                                  expr: {
                                    Atom: "string-ascii",
                                  },
                                  id: 26,
                                  span: {
                                    start_line: 11,
                                    start_column: 50,
                                    end_line: 11,
                                    end_column: 61,
                                  },
                                },
                                {
                                  expr: {
                                    LiteralValue: {
                                      Int: "100",
                                    },
                                  },
                                  id: 27,
                                  span: {
                                    start_line: 11,
                                    start_column: 63,
                                    end_line: 11,
                                    end_column: 65,
                                  },
                                },
                              ],
                            },
                            id: 25,
                            span: {
                              start_line: 11,
                              start_column: 49,
                              end_line: 11,
                              end_column: 66,
                            },
                          },
                        ],
                      },
                      id: 23,
                      span: {
                        start_line: 11,
                        start_column: 34,
                        end_line: 11,
                        end_column: 67,
                      },
                    },
                    {
                      expr: {
                        List: [
                          {
                            expr: {
                              Atom: "called",
                            },
                            id: 29,
                            span: {
                              start_line: 11,
                              start_column: 70,
                              end_line: 11,
                              end_column: 75,
                            },
                          },
                          {
                            expr: {
                              Atom: "uint",
                            },
                            id: 30,
                            span: {
                              start_line: 11,
                              start_column: 77,
                              end_line: 11,
                              end_column: 80,
                            },
                          },
                        ],
                      },
                      id: 28,
                      span: {
                        start_line: 11,
                        start_column: 69,
                        end_line: 11,
                        end_column: 81,
                      },
                    },
                  ],
                },
                id: 21,
                span: {
                  start_line: 11,
                  start_column: 18,
                  end_line: 11,
                  end_column: 82,
                },
              },
              {
                expr: {
                  List: [
                    {
                      expr: {
                        Atom: "ok",
                      },
                      id: 32,
                      span: {
                        start_line: 12,
                        start_column: 6,
                        end_line: 12,
                        end_column: 7,
                      },
                    },
                    {
                      expr: {
                        List: [
                          {
                            expr: {
                              Atom: "map-set",
                            },
                            id: 34,
                            span: {
                              start_line: 12,
                              start_column: 10,
                              end_line: 12,
                              end_column: 16,
                            },
                          },
                          {
                            expr: {
                              Atom: "context",
                            },
                            id: 35,
                            span: {
                              start_line: 12,
                              start_column: 18,
                              end_line: 12,
                              end_column: 24,
                            },
                          },
                          {
                            expr: {
                              Atom: "function-name",
                            },
                            id: 36,
                            span: {
                              start_line: 12,
                              start_column: 26,
                              end_line: 12,
                              end_column: 38,
                            },
                          },
                          {
                            expr: {
                              List: [
                                {
                                  expr: {
                                    Atom: "tuple",
                                  },
                                  id: 38,
                                  span: {
                                    start_line: 0,
                                    start_column: 0,
                                    end_line: 0,
                                    end_column: 0,
                                  },
                                },
                                {
                                  expr: {
                                    List: [
                                      {
                                        expr: {
                                          Atom: "called",
                                        },
                                        id: 40,
                                        span: {
                                          start_line: 12,
                                          start_column: 41,
                                          end_line: 12,
                                          end_column: 46,
                                        },
                                      },
                                      {
                                        expr: {
                                          Atom: "called",
                                        },
                                        id: 41,
                                        span: {
                                          start_line: 12,
                                          start_column: 49,
                                          end_line: 12,
                                          end_column: 54,
                                        },
                                      },
                                    ],
                                  },
                                  id: 39,
                                  span: {
                                    start_line: 12,
                                    start_column: 41,
                                    end_line: 12,
                                    end_column: 54,
                                  },
                                },
                              ],
                            },
                            id: 37,
                            span: {
                              start_line: 12,
                              start_column: 40,
                              end_line: 12,
                              end_column: 55,
                            },
                          },
                        ],
                      },
                      id: 33,
                      span: {
                        start_line: 12,
                        start_column: 9,
                        end_line: 12,
                        end_column: 56,
                      },
                    },
                  ],
                },
                id: 31,
                span: {
                  start_line: 12,
                  start_column: 5,
                  end_line: 12,
                  end_column: 57,
                },
              },
            ],
          },
          id: 19,
          span: {
            start_line: 11,
            start_column: 3,
            end_line: 12,
            end_column: 58,
          },
        },
        {
          expr: {
            List: [
              {
                expr: {
                  Atom: "use-trait",
                },
                id: 43,
                span: {
                  start_line: 14,
                  start_column: 2,
                  end_line: 14,
                  end_column: 10,
                },
              },
              {
                expr: {
                  Atom: "ft-trait",
                },
                id: 44,
                span: {
                  start_line: 14,
                  start_column: 12,
                  end_line: 14,
                  end_column: 19,
                },
              },
              {
                expr: {
                  Field: {
                    name: "sip-010-trait",
                    contract_identifier: {
                      issuer: [
                        22,
                        [
                          9, 159, 184, 137, 38, 216, 47, 48, 178, 244, 14, 175,
                          62, 228, 35, 203, 114, 91, 219, 59,
                        ],
                      ],
                      name: "sip-010-trait-ft-standard",
                    },
                  },
                },
                id: 45,
                span: {
                  start_line: 14,
                  start_column: 21,
                  end_line: 14,
                  end_column: 101,
                },
              },
            ],
          },
          id: 42,
          span: {
            start_line: 14,
            start_column: 1,
            end_line: 14,
            end_column: 102,
          },
        },
        {
          expr: {
            List: [
              {
                expr: {
                  Atom: "define-public",
                },
                id: 47,
                span: {
                  start_line: 16,
                  start_column: 2,
                  end_line: 16,
                  end_column: 14,
                },
              },
              {
                expr: {
                  List: [
                    {
                      expr: {
                        Atom: "test-no-trait",
                      },
                      id: 49,
                      span: {
                        start_line: 16,
                        start_column: 17,
                        end_line: 16,
                        end_column: 29,
                      },
                    },
                  ],
                },
                id: 48,
                span: {
                  start_line: 16,
                  start_column: 16,
                  end_line: 16,
                  end_column: 30,
                },
              },
              {
                expr: {
                  List: [
                    {
                      expr: {
                        Atom: "ok",
                      },
                      id: 51,
                      span: {
                        start_line: 17,
                        start_column: 4,
                        end_line: 17,
                        end_column: 5,
                      },
                    },
                    {
                      expr: {
                        Atom: "true",
                      },
                      id: 52,
                      span: {
                        start_line: 17,
                        start_column: 7,
                        end_line: 17,
                        end_column: 10,
                      },
                    },
                  ],
                },
                id: 50,
                span: {
                  start_line: 17,
                  start_column: 3,
                  end_line: 17,
                  end_column: 11,
                },
              },
            ],
          },
          id: 46,
          span: {
            start_line: 16,
            start_column: 1,
            end_line: 18,
            end_column: 1,
          },
        },
        {
          expr: {
            List: [
              {
                expr: {
                  Atom: "define-public",
                },
                id: 54,
                span: {
                  start_line: 20,
                  start_column: 2,
                  end_line: 20,
                  end_column: 14,
                },
              },
              {
                expr: {
                  List: [
                    {
                      expr: {
                        Atom: "test-trait",
                      },
                      id: 56,
                      span: {
                        start_line: 20,
                        start_column: 17,
                        end_line: 20,
                        end_column: 26,
                      },
                    },
                    {
                      expr: {
                        List: [
                          {
                            expr: {
                              Atom: "resp-trait-param",
                            },
                            id: 58,
                            span: {
                              start_line: 20,
                              start_column: 29,
                              end_line: 20,
                              end_column: 44,
                            },
                          },
                          {
                            expr: {
                              List: [
                                {
                                  expr: {
                                    Atom: "response",
                                  },
                                  id: 60,
                                  span: {
                                    start_line: 20,
                                    start_column: 47,
                                    end_line: 20,
                                    end_column: 54,
                                  },
                                },
                                {
                                  expr: {
                                    TraitReference: [
                                      "ft-trait",
                                      {
                                        Imported: {
                                          name: "sip-010-trait",
                                          contract_identifier: {
                                            issuer: [
                                              22,
                                              [
                                                9, 159, 184, 137, 38, 216, 47,
                                                48, 178, 244, 14, 175, 62, 228,
                                                35, 203, 114, 91, 219, 59,
                                              ],
                                            ],
                                            name: "sip-010-trait-ft-standard",
                                          },
                                        },
                                      },
                                    ],
                                  },
                                  id: 61,
                                  span: {
                                    start_line: 20,
                                    start_column: 56,
                                    end_line: 20,
                                    end_column: 65,
                                  },
                                },
                                {
                                  expr: {
                                    TraitReference: [
                                      "ft-trait",
                                      {
                                        Imported: {
                                          name: "sip-010-trait",
                                          contract_identifier: {
                                            issuer: [
                                              22,
                                              [
                                                9, 159, 184, 137, 38, 216, 47,
                                                48, 178, 244, 14, 175, 62, 228,
                                                35, 203, 114, 91, 219, 59,
                                              ],
                                            ],
                                            name: "sip-010-trait-ft-standard",
                                          },
                                        },
                                      },
                                    ],
                                  },
                                  id: 62,
                                  span: {
                                    start_line: 20,
                                    start_column: 67,
                                    end_line: 20,
                                    end_column: 76,
                                  },
                                },
                              ],
                            },
                            id: 59,
                            span: {
                              start_line: 20,
                              start_column: 46,
                              end_line: 20,
                              end_column: 77,
                            },
                          },
                        ],
                      },
                      id: 57,
                      span: {
                        start_line: 20,
                        start_column: 28,
                        end_line: 20,
                        end_column: 78,
                      },
                    },
                  ],
                },
                id: 55,
                span: {
                  start_line: 20,
                  start_column: 16,
                  end_line: 20,
                  end_column: 79,
                },
              },
              {
                expr: {
                  List: [
                    {
                      expr: {
                        Atom: "ok",
                      },
                      id: 64,
                      span: {
                        start_line: 21,
                        start_column: 4,
                        end_line: 21,
                        end_column: 5,
                      },
                    },
                    {
                      expr: {
                        Atom: "true",
                      },
                      id: 65,
                      span: {
                        start_line: 21,
                        start_column: 7,
                        end_line: 21,
                        end_column: 10,
                      },
                    },
                  ],
                },
                id: 63,
                span: {
                  start_line: 21,
                  start_column: 3,
                  end_line: 21,
                  end_column: 11,
                },
              },
            ],
          },
          id: 53,
          span: {
            start_line: 20,
            start_column: 1,
            end_line: 22,
            end_column: 1,
          },
        },
      ],
      top_level_expression_sorting: [0, 1, 2, 3, 4, 5],
      referenced_traits: {},
      implemented_traits: [],
    },
  },
  optionalTraitParameter: {
    functionsInterfaces: [
      {
        name: "function",
        access: "public",
        args: [],
        outputs: {
          type: {
            response: {
              ok: "bool",
              error: "none",
            },
          },
        },
      },
      {
        name: "test-no-trait",
        access: "public",
        args: [],
        outputs: {
          type: {
            response: {
              ok: "bool",
              error: "none",
            },
          },
        },
      },
      {
        name: "test-trait",
        access: "public",
        args: [
          {
            name: "opt-trait",
            type: {
              optional: "trait_reference",
            },
          },
        ],
        outputs: {
          type: {
            response: {
              ok: "bool",
              error: "none",
            },
          },
        },
      },
      {
        name: "update-context",
        access: "public",
        args: [
          {
            name: "function-name",
            type: {
              "string-ascii": {
                length: 100,
              },
            },
          },
          {
            name: "called",
            type: "uint128",
          },
        ],
        outputs: {
          type: {
            response: {
              ok: "bool",
              error: "none",
            },
          },
        },
      },
    ],
    ast: {
      contract_identifier: {
        issuer: [
          26,
          [
            109, 120, 222, 123, 6, 37, 223, 191, 193, 108, 58, 138, 87, 53, 246,
            220, 61, 195, 242, 206,
          ],
        ],
        name: "trait-contract",
      },
      pre_expressions: [],
      expressions: [
        {
          expr: {
            List: [
              {
                expr: {
                  Atom: "define-public",
                },
                id: 2,
                span: {
                  start_line: 1,
                  start_column: 2,
                  end_line: 1,
                  end_column: 14,
                },
              },
              {
                expr: {
                  List: [
                    {
                      expr: {
                        Atom: "function",
                      },
                      id: 4,
                      span: {
                        start_line: 1,
                        start_column: 17,
                        end_line: 1,
                        end_column: 24,
                      },
                    },
                  ],
                },
                id: 3,
                span: {
                  start_line: 1,
                  start_column: 16,
                  end_line: 1,
                  end_column: 25,
                },
              },
              {
                expr: {
                  List: [
                    {
                      expr: {
                        Atom: "ok",
                      },
                      id: 6,
                      span: {
                        start_line: 2,
                        start_column: 4,
                        end_line: 2,
                        end_column: 5,
                      },
                    },
                    {
                      expr: {
                        Atom: "true",
                      },
                      id: 7,
                      span: {
                        start_line: 2,
                        start_column: 7,
                        end_line: 2,
                        end_column: 10,
                      },
                    },
                  ],
                },
                id: 5,
                span: {
                  start_line: 2,
                  start_column: 3,
                  end_line: 2,
                  end_column: 11,
                },
              },
            ],
          },
          id: 1,
          span: {
            start_line: 1,
            start_column: 1,
            end_line: 3,
            end_column: 1,
          },
        },
        {
          expr: {
            List: [
              {
                expr: {
                  Atom: "define-map",
                },
                id: 9,
                span: {
                  start_line: 6,
                  start_column: 2,
                  end_line: 6,
                  end_column: 11,
                },
              },
              {
                expr: {
                  Atom: "context",
                },
                id: 10,
                span: {
                  start_line: 6,
                  start_column: 13,
                  end_line: 6,
                  end_column: 19,
                },
              },
              {
                expr: {
                  List: [
                    {
                      expr: {
                        Atom: "string-ascii",
                      },
                      id: 12,
                      span: {
                        start_line: 6,
                        start_column: 22,
                        end_line: 6,
                        end_column: 33,
                      },
                    },
                    {
                      expr: {
                        LiteralValue: {
                          Int: "100",
                        },
                      },
                      id: 13,
                      span: {
                        start_line: 6,
                        start_column: 35,
                        end_line: 6,
                        end_column: 37,
                      },
                    },
                  ],
                },
                id: 11,
                span: {
                  start_line: 6,
                  start_column: 21,
                  end_line: 6,
                  end_column: 38,
                },
              },
              {
                expr: {
                  List: [
                    {
                      expr: {
                        Atom: "tuple",
                      },
                      id: 15,
                      span: {
                        start_line: 0,
                        start_column: 0,
                        end_line: 0,
                        end_column: 0,
                      },
                    },
                    {
                      expr: {
                        List: [
                          {
                            expr: {
                              Atom: "called",
                            },
                            id: 17,
                            span: {
                              start_line: 7,
                              start_column: 5,
                              end_line: 7,
                              end_column: 10,
                            },
                          },
                          {
                            expr: {
                              Atom: "uint",
                            },
                            id: 18,
                            span: {
                              start_line: 7,
                              start_column: 13,
                              end_line: 7,
                              end_column: 16,
                            },
                            post_comments: [
                              [
                                "other data",
                                {
                                  start_line: 8,
                                  start_column: 5,
                                  end_line: 8,
                                  end_column: 17,
                                },
                              ],
                            ],
                          },
                        ],
                      },
                      id: 16,
                      span: {
                        start_line: 7,
                        start_column: 5,
                        end_line: 7,
                        end_column: 16,
                      },
                    },
                  ],
                },
                id: 14,
                span: {
                  start_line: 6,
                  start_column: 40,
                  end_line: 9,
                  end_column: 3,
                },
              },
            ],
          },
          id: 8,
          span: {
            start_line: 6,
            start_column: 1,
            end_line: 9,
            end_column: 4,
          },
        },
        {
          expr: {
            List: [
              {
                expr: {
                  Atom: "define-public",
                },
                id: 20,
                span: {
                  start_line: 11,
                  start_column: 4,
                  end_line: 11,
                  end_column: 16,
                },
              },
              {
                expr: {
                  List: [
                    {
                      expr: {
                        Atom: "update-context",
                      },
                      id: 22,
                      span: {
                        start_line: 11,
                        start_column: 19,
                        end_line: 11,
                        end_column: 32,
                      },
                    },
                    {
                      expr: {
                        List: [
                          {
                            expr: {
                              Atom: "function-name",
                            },
                            id: 24,
                            span: {
                              start_line: 11,
                              start_column: 35,
                              end_line: 11,
                              end_column: 47,
                            },
                          },
                          {
                            expr: {
                              List: [
                                {
                                  expr: {
                                    Atom: "string-ascii",
                                  },
                                  id: 26,
                                  span: {
                                    start_line: 11,
                                    start_column: 50,
                                    end_line: 11,
                                    end_column: 61,
                                  },
                                },
                                {
                                  expr: {
                                    LiteralValue: {
                                      Int: "100",
                                    },
                                  },
                                  id: 27,
                                  span: {
                                    start_line: 11,
                                    start_column: 63,
                                    end_line: 11,
                                    end_column: 65,
                                  },
                                },
                              ],
                            },
                            id: 25,
                            span: {
                              start_line: 11,
                              start_column: 49,
                              end_line: 11,
                              end_column: 66,
                            },
                          },
                        ],
                      },
                      id: 23,
                      span: {
                        start_line: 11,
                        start_column: 34,
                        end_line: 11,
                        end_column: 67,
                      },
                    },
                    {
                      expr: {
                        List: [
                          {
                            expr: {
                              Atom: "called",
                            },
                            id: 29,
                            span: {
                              start_line: 11,
                              start_column: 70,
                              end_line: 11,
                              end_column: 75,
                            },
                          },
                          {
                            expr: {
                              Atom: "uint",
                            },
                            id: 30,
                            span: {
                              start_line: 11,
                              start_column: 77,
                              end_line: 11,
                              end_column: 80,
                            },
                          },
                        ],
                      },
                      id: 28,
                      span: {
                        start_line: 11,
                        start_column: 69,
                        end_line: 11,
                        end_column: 81,
                      },
                    },
                  ],
                },
                id: 21,
                span: {
                  start_line: 11,
                  start_column: 18,
                  end_line: 11,
                  end_column: 82,
                },
              },
              {
                expr: {
                  List: [
                    {
                      expr: {
                        Atom: "ok",
                      },
                      id: 32,
                      span: {
                        start_line: 12,
                        start_column: 6,
                        end_line: 12,
                        end_column: 7,
                      },
                    },
                    {
                      expr: {
                        List: [
                          {
                            expr: {
                              Atom: "map-set",
                            },
                            id: 34,
                            span: {
                              start_line: 12,
                              start_column: 10,
                              end_line: 12,
                              end_column: 16,
                            },
                          },
                          {
                            expr: {
                              Atom: "context",
                            },
                            id: 35,
                            span: {
                              start_line: 12,
                              start_column: 18,
                              end_line: 12,
                              end_column: 24,
                            },
                          },
                          {
                            expr: {
                              Atom: "function-name",
                            },
                            id: 36,
                            span: {
                              start_line: 12,
                              start_column: 26,
                              end_line: 12,
                              end_column: 38,
                            },
                          },
                          {
                            expr: {
                              List: [
                                {
                                  expr: {
                                    Atom: "tuple",
                                  },
                                  id: 38,
                                  span: {
                                    start_line: 0,
                                    start_column: 0,
                                    end_line: 0,
                                    end_column: 0,
                                  },
                                },
                                {
                                  expr: {
                                    List: [
                                      {
                                        expr: {
                                          Atom: "called",
                                        },
                                        id: 40,
                                        span: {
                                          start_line: 12,
                                          start_column: 41,
                                          end_line: 12,
                                          end_column: 46,
                                        },
                                      },
                                      {
                                        expr: {
                                          Atom: "called",
                                        },
                                        id: 41,
                                        span: {
                                          start_line: 12,
                                          start_column: 49,
                                          end_line: 12,
                                          end_column: 54,
                                        },
                                      },
                                    ],
                                  },
                                  id: 39,
                                  span: {
                                    start_line: 12,
                                    start_column: 41,
                                    end_line: 12,
                                    end_column: 54,
                                  },
                                },
                              ],
                            },
                            id: 37,
                            span: {
                              start_line: 12,
                              start_column: 40,
                              end_line: 12,
                              end_column: 55,
                            },
                          },
                        ],
                      },
                      id: 33,
                      span: {
                        start_line: 12,
                        start_column: 9,
                        end_line: 12,
                        end_column: 56,
                      },
                    },
                  ],
                },
                id: 31,
                span: {
                  start_line: 12,
                  start_column: 5,
                  end_line: 12,
                  end_column: 57,
                },
              },
            ],
          },
          id: 19,
          span: {
            start_line: 11,
            start_column: 3,
            end_line: 12,
            end_column: 58,
          },
        },
        {
          expr: {
            List: [
              {
                expr: {
                  Atom: "use-trait",
                },
                id: 43,
                span: {
                  start_line: 14,
                  start_column: 2,
                  end_line: 14,
                  end_column: 10,
                },
              },
              {
                expr: {
                  Atom: "ft-trait",
                },
                id: 44,
                span: {
                  start_line: 14,
                  start_column: 12,
                  end_line: 14,
                  end_column: 19,
                },
              },
              {
                expr: {
                  Field: {
                    name: "sip-010-trait",
                    contract_identifier: {
                      issuer: [
                        22,
                        [
                          9, 159, 184, 137, 38, 216, 47, 48, 178, 244, 14, 175,
                          62, 228, 35, 203, 114, 91, 219, 59,
                        ],
                      ],
                      name: "sip-010-trait-ft-standard",
                    },
                  },
                },
                id: 45,
                span: {
                  start_line: 14,
                  start_column: 21,
                  end_line: 14,
                  end_column: 101,
                },
              },
            ],
          },
          id: 42,
          span: {
            start_line: 14,
            start_column: 1,
            end_line: 14,
            end_column: 102,
          },
        },
        {
          expr: {
            List: [
              {
                expr: {
                  Atom: "define-public",
                },
                id: 47,
                span: {
                  start_line: 16,
                  start_column: 2,
                  end_line: 16,
                  end_column: 14,
                },
              },
              {
                expr: {
                  List: [
                    {
                      expr: {
                        Atom: "test-no-trait",
                      },
                      id: 49,
                      span: {
                        start_line: 16,
                        start_column: 17,
                        end_line: 16,
                        end_column: 29,
                      },
                    },
                  ],
                },
                id: 48,
                span: {
                  start_line: 16,
                  start_column: 16,
                  end_line: 16,
                  end_column: 30,
                },
              },
              {
                expr: {
                  List: [
                    {
                      expr: {
                        Atom: "ok",
                      },
                      id: 51,
                      span: {
                        start_line: 17,
                        start_column: 4,
                        end_line: 17,
                        end_column: 5,
                      },
                    },
                    {
                      expr: {
                        Atom: "true",
                      },
                      id: 52,
                      span: {
                        start_line: 17,
                        start_column: 7,
                        end_line: 17,
                        end_column: 10,
                      },
                    },
                  ],
                },
                id: 50,
                span: {
                  start_line: 17,
                  start_column: 3,
                  end_line: 17,
                  end_column: 11,
                },
              },
            ],
          },
          id: 46,
          span: {
            start_line: 16,
            start_column: 1,
            end_line: 18,
            end_column: 1,
          },
        },
        {
          expr: {
            List: [
              {
                expr: {
                  Atom: "define-public",
                },
                id: 54,
                span: {
                  start_line: 20,
                  start_column: 2,
                  end_line: 20,
                  end_column: 14,
                },
              },
              {
                expr: {
                  List: [
                    {
                      expr: {
                        Atom: "test-trait",
                      },
                      id: 56,
                      span: {
                        start_line: 20,
                        start_column: 17,
                        end_line: 20,
                        end_column: 26,
                      },
                    },
                    {
                      expr: {
                        List: [
                          {
                            expr: {
                              Atom: "opt-trait",
                            },
                            id: 58,
                            span: {
                              start_line: 20,
                              start_column: 29,
                              end_line: 20,
                              end_column: 37,
                            },
                          },
                          {
                            expr: {
                              List: [
                                {
                                  expr: {
                                    Atom: "optional",
                                  },
                                  id: 60,
                                  span: {
                                    start_line: 20,
                                    start_column: 40,
                                    end_line: 20,
                                    end_column: 47,
                                  },
                                },
                                {
                                  expr: {
                                    TraitReference: [
                                      "ft-trait",
                                      {
                                        Imported: {
                                          name: "sip-010-trait",
                                          contract_identifier: {
                                            issuer: [
                                              22,
                                              [
                                                9, 159, 184, 137, 38, 216, 47,
                                                48, 178, 244, 14, 175, 62, 228,
                                                35, 203, 114, 91, 219, 59,
                                              ],
                                            ],
                                            name: "sip-010-trait-ft-standard",
                                          },
                                        },
                                      },
                                    ],
                                  },
                                  id: 61,
                                  span: {
                                    start_line: 20,
                                    start_column: 49,
                                    end_line: 20,
                                    end_column: 58,
                                  },
                                },
                              ],
                            },
                            id: 59,
                            span: {
                              start_line: 20,
                              start_column: 39,
                              end_line: 20,
                              end_column: 59,
                            },
                          },
                        ],
                      },
                      id: 57,
                      span: {
                        start_line: 20,
                        start_column: 28,
                        end_line: 20,
                        end_column: 60,
                      },
                    },
                  ],
                },
                id: 55,
                span: {
                  start_line: 20,
                  start_column: 16,
                  end_line: 20,
                  end_column: 61,
                },
              },
              {
                expr: {
                  List: [
                    {
                      expr: {
                        Atom: "ok",
                      },
                      id: 63,
                      span: {
                        start_line: 21,
                        start_column: 4,
                        end_line: 21,
                        end_column: 5,
                      },
                    },
                    {
                      expr: {
                        Atom: "true",
                      },
                      id: 64,
                      span: {
                        start_line: 21,
                        start_column: 7,
                        end_line: 21,
                        end_column: 10,
                      },
                    },
                  ],
                },
                id: 62,
                span: {
                  start_line: 21,
                  start_column: 3,
                  end_line: 21,
                  end_column: 11,
                },
              },
            ],
          },
          id: 53,
          span: {
            start_line: 20,
            start_column: 1,
            end_line: 22,
            end_column: 1,
          },
        },
      ],
      top_level_expression_sorting: [0, 1, 2, 3, 4, 5],
      referenced_traits: {},
      implemented_traits: [],
    },
  },
  mixedDirectAndNestedTraits: {
    functionsInterfaces: [
      {
        name: "function",
        access: "public",
        args: [],
        outputs: {
          type: {
            response: {
              ok: "bool",
              error: "none",
            },
          },
        },
      },
      {
        name: "test-mixed-traits",
        access: "public",
        args: [
          {
            name: "direct",
            type: "trait_reference",
          },
          {
            name: "list-1",
            type: {
              list: {
                type: "trait_reference",
                length: 4,
              },
            },
          },
          {
            name: "mad",
            type: {
              tuple: [
                {
                  name: "list-mad",
                  type: {
                    list: {
                      type: {
                        tuple: [
                          {
                            name: "mad-inner",
                            type: "trait_reference",
                          },
                        ],
                      },
                      length: 7,
                    },
                  },
                },
              ],
            },
          },
        ],
        outputs: {
          type: {
            response: {
              ok: "bool",
              error: "none",
            },
          },
        },
      },
      {
        name: "update-context",
        access: "public",
        args: [
          {
            name: "function-name",
            type: {
              "string-ascii": {
                length: 100,
              },
            },
          },
          {
            name: "called",
            type: "uint128",
          },
        ],
        outputs: {
          type: {
            response: {
              ok: "bool",
              error: "none",
            },
          },
        },
      },
    ],
    ast: {
      contract_identifier: {
        issuer: [
          26,
          [
            109, 120, 222, 123, 6, 37, 223, 191, 193, 108, 58, 138, 87, 53, 246,
            220, 61, 195, 242, 206,
          ],
        ],
        name: "trait-contract",
      },
      pre_expressions: [],
      expressions: [
        {
          expr: {
            List: [
              {
                expr: {
                  Atom: "use-trait",
                },
                id: 2,
                span: {
                  start_line: 1,
                  start_column: 2,
                  end_line: 1,
                  end_column: 10,
                },
              },
              {
                expr: {
                  Atom: "ft-trait",
                },
                id: 3,
                span: {
                  start_line: 1,
                  start_column: 12,
                  end_line: 1,
                  end_column: 19,
                },
              },
              {
                expr: {
                  Field: {
                    name: "sip-010-trait",
                    contract_identifier: {
                      issuer: [
                        22,
                        [
                          9, 159, 184, 137, 38, 216, 47, 48, 178, 244, 14, 175,
                          62, 228, 35, 203, 114, 91, 219, 59,
                        ],
                      ],
                      name: "sip-010-trait-ft-standard",
                    },
                  },
                },
                id: 4,
                span: {
                  start_line: 1,
                  start_column: 21,
                  end_line: 1,
                  end_column: 101,
                },
              },
            ],
          },
          id: 1,
          span: {
            start_line: 1,
            start_column: 1,
            end_line: 1,
            end_column: 102,
          },
        },
        {
          expr: {
            List: [
              {
                expr: {
                  Atom: "define-public",
                },
                id: 6,
                span: {
                  start_line: 3,
                  start_column: 2,
                  end_line: 3,
                  end_column: 14,
                },
              },
              {
                expr: {
                  List: [
                    {
                      expr: {
                        Atom: "function",
                      },
                      id: 8,
                      span: {
                        start_line: 3,
                        start_column: 17,
                        end_line: 3,
                        end_column: 24,
                      },
                    },
                  ],
                },
                id: 7,
                span: {
                  start_line: 3,
                  start_column: 16,
                  end_line: 3,
                  end_column: 25,
                },
              },
              {
                expr: {
                  List: [
                    {
                      expr: {
                        Atom: "ok",
                      },
                      id: 10,
                      span: {
                        start_line: 4,
                        start_column: 4,
                        end_line: 4,
                        end_column: 5,
                      },
                    },
                    {
                      expr: {
                        Atom: "true",
                      },
                      id: 11,
                      span: {
                        start_line: 4,
                        start_column: 7,
                        end_line: 4,
                        end_column: 10,
                      },
                    },
                  ],
                },
                id: 9,
                span: {
                  start_line: 4,
                  start_column: 3,
                  end_line: 4,
                  end_column: 11,
                },
              },
            ],
          },
          id: 5,
          span: {
            start_line: 3,
            start_column: 1,
            end_line: 5,
            end_column: 1,
          },
        },
        {
          expr: {
            List: [
              {
                expr: {
                  Atom: "define-map",
                },
                id: 13,
                span: {
                  start_line: 8,
                  start_column: 2,
                  end_line: 8,
                  end_column: 11,
                },
              },
              {
                expr: {
                  Atom: "context",
                },
                id: 14,
                span: {
                  start_line: 8,
                  start_column: 13,
                  end_line: 8,
                  end_column: 19,
                },
              },
              {
                expr: {
                  List: [
                    {
                      expr: {
                        Atom: "string-ascii",
                      },
                      id: 16,
                      span: {
                        start_line: 8,
                        start_column: 22,
                        end_line: 8,
                        end_column: 33,
                      },
                    },
                    {
                      expr: {
                        LiteralValue: {
                          Int: "100",
                        },
                      },
                      id: 17,
                      span: {
                        start_line: 8,
                        start_column: 35,
                        end_line: 8,
                        end_column: 37,
                      },
                    },
                  ],
                },
                id: 15,
                span: {
                  start_line: 8,
                  start_column: 21,
                  end_line: 8,
                  end_column: 38,
                },
              },
              {
                expr: {
                  List: [
                    {
                      expr: {
                        Atom: "tuple",
                      },
                      id: 19,
                      span: {
                        start_line: 0,
                        start_column: 0,
                        end_line: 0,
                        end_column: 0,
                      },
                    },
                    {
                      expr: {
                        List: [
                          {
                            expr: {
                              Atom: "called",
                            },
                            id: 21,
                            span: {
                              start_line: 9,
                              start_column: 5,
                              end_line: 9,
                              end_column: 10,
                            },
                          },
                          {
                            expr: {
                              Atom: "uint",
                            },
                            id: 22,
                            span: {
                              start_line: 9,
                              start_column: 13,
                              end_line: 9,
                              end_column: 16,
                            },
                            post_comments: [
                              [
                                "other data",
                                {
                                  start_line: 10,
                                  start_column: 5,
                                  end_line: 10,
                                  end_column: 17,
                                },
                              ],
                            ],
                          },
                        ],
                      },
                      id: 20,
                      span: {
                        start_line: 9,
                        start_column: 5,
                        end_line: 9,
                        end_column: 16,
                      },
                    },
                  ],
                },
                id: 18,
                span: {
                  start_line: 8,
                  start_column: 40,
                  end_line: 11,
                  end_column: 3,
                },
              },
            ],
          },
          id: 12,
          span: {
            start_line: 8,
            start_column: 1,
            end_line: 11,
            end_column: 4,
          },
        },
        {
          expr: {
            List: [
              {
                expr: {
                  Atom: "define-public",
                },
                id: 24,
                span: {
                  start_line: 13,
                  start_column: 4,
                  end_line: 13,
                  end_column: 16,
                },
              },
              {
                expr: {
                  List: [
                    {
                      expr: {
                        Atom: "update-context",
                      },
                      id: 26,
                      span: {
                        start_line: 13,
                        start_column: 19,
                        end_line: 13,
                        end_column: 32,
                      },
                    },
                    {
                      expr: {
                        List: [
                          {
                            expr: {
                              Atom: "function-name",
                            },
                            id: 28,
                            span: {
                              start_line: 13,
                              start_column: 35,
                              end_line: 13,
                              end_column: 47,
                            },
                          },
                          {
                            expr: {
                              List: [
                                {
                                  expr: {
                                    Atom: "string-ascii",
                                  },
                                  id: 30,
                                  span: {
                                    start_line: 13,
                                    start_column: 50,
                                    end_line: 13,
                                    end_column: 61,
                                  },
                                },
                                {
                                  expr: {
                                    LiteralValue: {
                                      Int: "100",
                                    },
                                  },
                                  id: 31,
                                  span: {
                                    start_line: 13,
                                    start_column: 63,
                                    end_line: 13,
                                    end_column: 65,
                                  },
                                },
                              ],
                            },
                            id: 29,
                            span: {
                              start_line: 13,
                              start_column: 49,
                              end_line: 13,
                              end_column: 66,
                            },
                          },
                        ],
                      },
                      id: 27,
                      span: {
                        start_line: 13,
                        start_column: 34,
                        end_line: 13,
                        end_column: 67,
                      },
                    },
                    {
                      expr: {
                        List: [
                          {
                            expr: {
                              Atom: "called",
                            },
                            id: 33,
                            span: {
                              start_line: 13,
                              start_column: 70,
                              end_line: 13,
                              end_column: 75,
                            },
                          },
                          {
                            expr: {
                              Atom: "uint",
                            },
                            id: 34,
                            span: {
                              start_line: 13,
                              start_column: 77,
                              end_line: 13,
                              end_column: 80,
                            },
                          },
                        ],
                      },
                      id: 32,
                      span: {
                        start_line: 13,
                        start_column: 69,
                        end_line: 13,
                        end_column: 81,
                      },
                    },
                  ],
                },
                id: 25,
                span: {
                  start_line: 13,
                  start_column: 18,
                  end_line: 13,
                  end_column: 82,
                },
              },
              {
                expr: {
                  List: [
                    {
                      expr: {
                        Atom: "ok",
                      },
                      id: 36,
                      span: {
                        start_line: 14,
                        start_column: 6,
                        end_line: 14,
                        end_column: 7,
                      },
                    },
                    {
                      expr: {
                        List: [
                          {
                            expr: {
                              Atom: "map-set",
                            },
                            id: 38,
                            span: {
                              start_line: 14,
                              start_column: 10,
                              end_line: 14,
                              end_column: 16,
                            },
                          },
                          {
                            expr: {
                              Atom: "context",
                            },
                            id: 39,
                            span: {
                              start_line: 14,
                              start_column: 18,
                              end_line: 14,
                              end_column: 24,
                            },
                          },
                          {
                            expr: {
                              Atom: "function-name",
                            },
                            id: 40,
                            span: {
                              start_line: 14,
                              start_column: 26,
                              end_line: 14,
                              end_column: 38,
                            },
                          },
                          {
                            expr: {
                              List: [
                                {
                                  expr: {
                                    Atom: "tuple",
                                  },
                                  id: 42,
                                  span: {
                                    start_line: 0,
                                    start_column: 0,
                                    end_line: 0,
                                    end_column: 0,
                                  },
                                },
                                {
                                  expr: {
                                    List: [
                                      {
                                        expr: {
                                          Atom: "called",
                                        },
                                        id: 44,
                                        span: {
                                          start_line: 14,
                                          start_column: 41,
                                          end_line: 14,
                                          end_column: 46,
                                        },
                                      },
                                      {
                                        expr: {
                                          Atom: "called",
                                        },
                                        id: 45,
                                        span: {
                                          start_line: 14,
                                          start_column: 49,
                                          end_line: 14,
                                          end_column: 54,
                                        },
                                      },
                                    ],
                                  },
                                  id: 43,
                                  span: {
                                    start_line: 14,
                                    start_column: 41,
                                    end_line: 14,
                                    end_column: 54,
                                  },
                                },
                              ],
                            },
                            id: 41,
                            span: {
                              start_line: 14,
                              start_column: 40,
                              end_line: 14,
                              end_column: 55,
                            },
                          },
                        ],
                      },
                      id: 37,
                      span: {
                        start_line: 14,
                        start_column: 9,
                        end_line: 14,
                        end_column: 56,
                      },
                    },
                  ],
                },
                id: 35,
                span: {
                  start_line: 14,
                  start_column: 5,
                  end_line: 14,
                  end_column: 57,
                },
              },
            ],
          },
          id: 23,
          span: {
            start_line: 13,
            start_column: 3,
            end_line: 14,
            end_column: 58,
          },
        },
        {
          expr: {
            List: [
              {
                expr: {
                  Atom: "define-public",
                },
                id: 47,
                span: {
                  start_line: 16,
                  start_column: 2,
                  end_line: 16,
                  end_column: 14,
                },
              },
              {
                expr: {
                  List: [
                    {
                      expr: {
                        Atom: "test-mixed-traits",
                      },
                      id: 49,
                      span: {
                        start_line: 16,
                        start_column: 17,
                        end_line: 16,
                        end_column: 33,
                      },
                    },
                    {
                      expr: {
                        List: [
                          {
                            expr: {
                              Atom: "direct",
                            },
                            id: 51,
                            span: {
                              start_line: 17,
                              start_column: 6,
                              end_line: 17,
                              end_column: 11,
                            },
                          },
                          {
                            expr: {
                              TraitReference: [
                                "ft-trait",
                                {
                                  Imported: {
                                    name: "sip-010-trait",
                                    contract_identifier: {
                                      issuer: [
                                        22,
                                        [
                                          9, 159, 184, 137, 38, 216, 47, 48,
                                          178, 244, 14, 175, 62, 228, 35, 203,
                                          114, 91, 219, 59,
                                        ],
                                      ],
                                      name: "sip-010-trait-ft-standard",
                                    },
                                  },
                                },
                              ],
                            },
                            id: 52,
                            span: {
                              start_line: 17,
                              start_column: 13,
                              end_line: 17,
                              end_column: 22,
                            },
                          },
                        ],
                      },
                      id: 50,
                      span: {
                        start_line: 17,
                        start_column: 5,
                        end_line: 17,
                        end_column: 23,
                      },
                    },
                    {
                      expr: {
                        List: [
                          {
                            expr: {
                              Atom: "list-1",
                            },
                            id: 54,
                            span: {
                              start_line: 18,
                              start_column: 6,
                              end_line: 18,
                              end_column: 11,
                            },
                          },
                          {
                            expr: {
                              List: [
                                {
                                  expr: {
                                    Atom: "list",
                                  },
                                  id: 56,
                                  span: {
                                    start_line: 18,
                                    start_column: 14,
                                    end_line: 18,
                                    end_column: 17,
                                  },
                                },
                                {
                                  expr: {
                                    LiteralValue: {
                                      Int: "4",
                                    },
                                  },
                                  id: 57,
                                  span: {
                                    start_line: 18,
                                    start_column: 19,
                                    end_line: 18,
                                    end_column: 19,
                                  },
                                },
                                {
                                  expr: {
                                    TraitReference: [
                                      "ft-trait",
                                      {
                                        Imported: {
                                          name: "sip-010-trait",
                                          contract_identifier: {
                                            issuer: [
                                              22,
                                              [
                                                9, 159, 184, 137, 38, 216, 47,
                                                48, 178, 244, 14, 175, 62, 228,
                                                35, 203, 114, 91, 219, 59,
                                              ],
                                            ],
                                            name: "sip-010-trait-ft-standard",
                                          },
                                        },
                                      },
                                    ],
                                  },
                                  id: 58,
                                  span: {
                                    start_line: 18,
                                    start_column: 21,
                                    end_line: 18,
                                    end_column: 30,
                                  },
                                },
                              ],
                            },
                            id: 55,
                            span: {
                              start_line: 18,
                              start_column: 13,
                              end_line: 18,
                              end_column: 31,
                            },
                          },
                        ],
                      },
                      id: 53,
                      span: {
                        start_line: 18,
                        start_column: 5,
                        end_line: 18,
                        end_column: 32,
                      },
                    },
                    {
                      expr: {
                        List: [
                          {
                            expr: {
                              Atom: "mad",
                            },
                            id: 60,
                            span: {
                              start_line: 19,
                              start_column: 6,
                              end_line: 19,
                              end_column: 8,
                            },
                          },
                          {
                            expr: {
                              List: [
                                {
                                  expr: {
                                    Atom: "tuple",
                                  },
                                  id: 62,
                                  span: {
                                    start_line: 0,
                                    start_column: 0,
                                    end_line: 0,
                                    end_column: 0,
                                  },
                                },
                                {
                                  expr: {
                                    List: [
                                      {
                                        expr: {
                                          Atom: "list-mad",
                                        },
                                        id: 64,
                                        span: {
                                          start_line: 21,
                                          start_column: 9,
                                          end_line: 21,
                                          end_column: 16,
                                        },
                                      },
                                      {
                                        expr: {
                                          List: [
                                            {
                                              expr: {
                                                Atom: "list",
                                              },
                                              id: 66,
                                              span: {
                                                start_line: 21,
                                                start_column: 20,
                                                end_line: 21,
                                                end_column: 23,
                                              },
                                            },
                                            {
                                              expr: {
                                                LiteralValue: {
                                                  Int: "7",
                                                },
                                              },
                                              id: 67,
                                              span: {
                                                start_line: 21,
                                                start_column: 25,
                                                end_line: 21,
                                                end_column: 25,
                                              },
                                            },
                                            {
                                              expr: {
                                                List: [
                                                  {
                                                    expr: {
                                                      Atom: "tuple",
                                                    },
                                                    id: 69,
                                                    span: {
                                                      start_line: 0,
                                                      start_column: 0,
                                                      end_line: 0,
                                                      end_column: 0,
                                                    },
                                                  },
                                                  {
                                                    expr: {
                                                      List: [
                                                        {
                                                          expr: {
                                                            Atom: "mad-inner",
                                                          },
                                                          id: 71,
                                                          span: {
                                                            start_line: 21,
                                                            start_column: 29,
                                                            end_line: 21,
                                                            end_column: 37,
                                                          },
                                                        },
                                                        {
                                                          expr: {
                                                            TraitReference: [
                                                              "ft-trait",
                                                              {
                                                                Imported: {
                                                                  name: "sip-010-trait",
                                                                  contract_identifier:
                                                                    {
                                                                      issuer: [
                                                                        22,
                                                                        [
                                                                          9,
                                                                          159,
                                                                          184,
                                                                          137,
                                                                          38,
                                                                          216,
                                                                          47,
                                                                          48,
                                                                          178,
                                                                          244,
                                                                          14,
                                                                          175,
                                                                          62,
                                                                          228,
                                                                          35,
                                                                          203,
                                                                          114,
                                                                          91,
                                                                          219,
                                                                          59,
                                                                        ],
                                                                      ],
                                                                      name: "sip-010-trait-ft-standard",
                                                                    },
                                                                },
                                                              },
                                                            ],
                                                          },
                                                          id: 72,
                                                          span: {
                                                            start_line: 21,
                                                            start_column: 40,
                                                            end_line: 21,
                                                            end_column: 49,
                                                          },
                                                        },
                                                      ],
                                                    },
                                                    id: 70,
                                                    span: {
                                                      start_line: 21,
                                                      start_column: 29,
                                                      end_line: 21,
                                                      end_column: 49,
                                                    },
                                                  },
                                                ],
                                              },
                                              id: 68,
                                              span: {
                                                start_line: 21,
                                                start_column: 27,
                                                end_line: 21,
                                                end_column: 51,
                                              },
                                            },
                                          ],
                                        },
                                        id: 65,
                                        span: {
                                          start_line: 21,
                                          start_column: 19,
                                          end_line: 21,
                                          end_column: 52,
                                        },
                                      },
                                    ],
                                  },
                                  id: 63,
                                  span: {
                                    start_line: 21,
                                    start_column: 9,
                                    end_line: 21,
                                    end_column: 52,
                                  },
                                },
                              ],
                            },
                            id: 61,
                            span: {
                              start_line: 20,
                              start_column: 7,
                              end_line: 22,
                              end_column: 7,
                            },
                          },
                        ],
                      },
                      id: 59,
                      span: {
                        start_line: 19,
                        start_column: 5,
                        end_line: 23,
                        end_column: 5,
                      },
                    },
                  ],
                },
                id: 48,
                span: {
                  start_line: 16,
                  start_column: 16,
                  end_line: 24,
                  end_column: 3,
                },
              },
              {
                expr: {
                  List: [
                    {
                      expr: {
                        Atom: "ok",
                      },
                      id: 74,
                      span: {
                        start_line: 25,
                        start_column: 4,
                        end_line: 25,
                        end_column: 5,
                      },
                    },
                    {
                      expr: {
                        Atom: "true",
                      },
                      id: 75,
                      span: {
                        start_line: 25,
                        start_column: 7,
                        end_line: 25,
                        end_column: 10,
                      },
                    },
                  ],
                },
                id: 73,
                span: {
                  start_line: 25,
                  start_column: 3,
                  end_line: 25,
                  end_column: 11,
                },
              },
            ],
          },
          id: 46,
          span: {
            start_line: 16,
            start_column: 1,
            end_line: 26,
            end_column: 1,
          },
        },
      ],
      top_level_expression_sorting: [0, 1, 2, 3, 4],
      referenced_traits: {},
      implemented_traits: [],
    },
  },
  listTupleNestedTrait: {
    functionsInterfaces: [
      {
        name: "function",
        access: "public",
        args: [],
        outputs: {
          type: {
            response: {
              ok: "bool",
              error: "none",
            },
          },
        },
      },
      {
        name: "test-mixed-traits",
        access: "public",
        args: [
          {
            name: "list-tuple-trait",
            type: {
              list: {
                type: {
                  tuple: [
                    {
                      name: "mad-inner",
                      type: "trait_reference",
                    },
                  ],
                },
                length: 4,
              },
            },
          },
        ],
        outputs: {
          type: {
            response: {
              ok: "bool",
              error: "none",
            },
          },
        },
      },
      {
        name: "update-context",
        access: "public",
        args: [
          {
            name: "function-name",
            type: {
              "string-ascii": {
                length: 100,
              },
            },
          },
          {
            name: "called",
            type: "uint128",
          },
        ],
        outputs: {
          type: {
            response: {
              ok: "bool",
              error: "none",
            },
          },
        },
      },
    ],
    ast: {
      contract_identifier: {
        issuer: [
          26,
          [
            109, 120, 222, 123, 6, 37, 223, 191, 193, 108, 58, 138, 87, 53, 246,
            220, 61, 195, 242, 206,
          ],
        ],
        name: "trait-contract",
      },
      pre_expressions: [],
      expressions: [
        {
          expr: {
            List: [
              {
                expr: {
                  Atom: "use-trait",
                },
                id: 2,
                span: {
                  start_line: 1,
                  start_column: 2,
                  end_line: 1,
                  end_column: 10,
                },
              },
              {
                expr: {
                  Atom: "ft-trait",
                },
                id: 3,
                span: {
                  start_line: 1,
                  start_column: 12,
                  end_line: 1,
                  end_column: 19,
                },
              },
              {
                expr: {
                  Field: {
                    name: "sip-010-trait",
                    contract_identifier: {
                      issuer: [
                        22,
                        [
                          9, 159, 184, 137, 38, 216, 47, 48, 178, 244, 14, 175,
                          62, 228, 35, 203, 114, 91, 219, 59,
                        ],
                      ],
                      name: "sip-010-trait-ft-standard",
                    },
                  },
                },
                id: 4,
                span: {
                  start_line: 1,
                  start_column: 21,
                  end_line: 1,
                  end_column: 101,
                },
              },
            ],
          },
          id: 1,
          span: {
            start_line: 1,
            start_column: 1,
            end_line: 1,
            end_column: 102,
          },
        },
        {
          expr: {
            List: [
              {
                expr: {
                  Atom: "define-public",
                },
                id: 6,
                span: {
                  start_line: 3,
                  start_column: 2,
                  end_line: 3,
                  end_column: 14,
                },
              },
              {
                expr: {
                  List: [
                    {
                      expr: {
                        Atom: "function",
                      },
                      id: 8,
                      span: {
                        start_line: 3,
                        start_column: 17,
                        end_line: 3,
                        end_column: 24,
                      },
                    },
                  ],
                },
                id: 7,
                span: {
                  start_line: 3,
                  start_column: 16,
                  end_line: 3,
                  end_column: 25,
                },
              },
              {
                expr: {
                  List: [
                    {
                      expr: {
                        Atom: "ok",
                      },
                      id: 10,
                      span: {
                        start_line: 4,
                        start_column: 4,
                        end_line: 4,
                        end_column: 5,
                      },
                    },
                    {
                      expr: {
                        Atom: "true",
                      },
                      id: 11,
                      span: {
                        start_line: 4,
                        start_column: 7,
                        end_line: 4,
                        end_column: 10,
                      },
                    },
                  ],
                },
                id: 9,
                span: {
                  start_line: 4,
                  start_column: 3,
                  end_line: 4,
                  end_column: 11,
                },
              },
            ],
          },
          id: 5,
          span: {
            start_line: 3,
            start_column: 1,
            end_line: 5,
            end_column: 1,
          },
        },
        {
          expr: {
            List: [
              {
                expr: {
                  Atom: "define-map",
                },
                id: 13,
                span: {
                  start_line: 8,
                  start_column: 2,
                  end_line: 8,
                  end_column: 11,
                },
              },
              {
                expr: {
                  Atom: "context",
                },
                id: 14,
                span: {
                  start_line: 8,
                  start_column: 13,
                  end_line: 8,
                  end_column: 19,
                },
              },
              {
                expr: {
                  List: [
                    {
                      expr: {
                        Atom: "string-ascii",
                      },
                      id: 16,
                      span: {
                        start_line: 8,
                        start_column: 22,
                        end_line: 8,
                        end_column: 33,
                      },
                    },
                    {
                      expr: {
                        LiteralValue: {
                          Int: "100",
                        },
                      },
                      id: 17,
                      span: {
                        start_line: 8,
                        start_column: 35,
                        end_line: 8,
                        end_column: 37,
                      },
                    },
                  ],
                },
                id: 15,
                span: {
                  start_line: 8,
                  start_column: 21,
                  end_line: 8,
                  end_column: 38,
                },
              },
              {
                expr: {
                  List: [
                    {
                      expr: {
                        Atom: "tuple",
                      },
                      id: 19,
                      span: {
                        start_line: 0,
                        start_column: 0,
                        end_line: 0,
                        end_column: 0,
                      },
                    },
                    {
                      expr: {
                        List: [
                          {
                            expr: {
                              Atom: "called",
                            },
                            id: 21,
                            span: {
                              start_line: 9,
                              start_column: 5,
                              end_line: 9,
                              end_column: 10,
                            },
                          },
                          {
                            expr: {
                              Atom: "uint",
                            },
                            id: 22,
                            span: {
                              start_line: 9,
                              start_column: 13,
                              end_line: 9,
                              end_column: 16,
                            },
                            post_comments: [
                              [
                                "other data",
                                {
                                  start_line: 10,
                                  start_column: 5,
                                  end_line: 10,
                                  end_column: 17,
                                },
                              ],
                            ],
                          },
                        ],
                      },
                      id: 20,
                      span: {
                        start_line: 9,
                        start_column: 5,
                        end_line: 9,
                        end_column: 16,
                      },
                    },
                  ],
                },
                id: 18,
                span: {
                  start_line: 8,
                  start_column: 40,
                  end_line: 11,
                  end_column: 3,
                },
              },
            ],
          },
          id: 12,
          span: {
            start_line: 8,
            start_column: 1,
            end_line: 11,
            end_column: 4,
          },
        },
        {
          expr: {
            List: [
              {
                expr: {
                  Atom: "define-public",
                },
                id: 24,
                span: {
                  start_line: 13,
                  start_column: 4,
                  end_line: 13,
                  end_column: 16,
                },
              },
              {
                expr: {
                  List: [
                    {
                      expr: {
                        Atom: "update-context",
                      },
                      id: 26,
                      span: {
                        start_line: 13,
                        start_column: 19,
                        end_line: 13,
                        end_column: 32,
                      },
                    },
                    {
                      expr: {
                        List: [
                          {
                            expr: {
                              Atom: "function-name",
                            },
                            id: 28,
                            span: {
                              start_line: 13,
                              start_column: 35,
                              end_line: 13,
                              end_column: 47,
                            },
                          },
                          {
                            expr: {
                              List: [
                                {
                                  expr: {
                                    Atom: "string-ascii",
                                  },
                                  id: 30,
                                  span: {
                                    start_line: 13,
                                    start_column: 50,
                                    end_line: 13,
                                    end_column: 61,
                                  },
                                },
                                {
                                  expr: {
                                    LiteralValue: {
                                      Int: "100",
                                    },
                                  },
                                  id: 31,
                                  span: {
                                    start_line: 13,
                                    start_column: 63,
                                    end_line: 13,
                                    end_column: 65,
                                  },
                                },
                              ],
                            },
                            id: 29,
                            span: {
                              start_line: 13,
                              start_column: 49,
                              end_line: 13,
                              end_column: 66,
                            },
                          },
                        ],
                      },
                      id: 27,
                      span: {
                        start_line: 13,
                        start_column: 34,
                        end_line: 13,
                        end_column: 67,
                      },
                    },
                    {
                      expr: {
                        List: [
                          {
                            expr: {
                              Atom: "called",
                            },
                            id: 33,
                            span: {
                              start_line: 13,
                              start_column: 70,
                              end_line: 13,
                              end_column: 75,
                            },
                          },
                          {
                            expr: {
                              Atom: "uint",
                            },
                            id: 34,
                            span: {
                              start_line: 13,
                              start_column: 77,
                              end_line: 13,
                              end_column: 80,
                            },
                          },
                        ],
                      },
                      id: 32,
                      span: {
                        start_line: 13,
                        start_column: 69,
                        end_line: 13,
                        end_column: 81,
                      },
                    },
                  ],
                },
                id: 25,
                span: {
                  start_line: 13,
                  start_column: 18,
                  end_line: 13,
                  end_column: 82,
                },
              },
              {
                expr: {
                  List: [
                    {
                      expr: {
                        Atom: "ok",
                      },
                      id: 36,
                      span: {
                        start_line: 14,
                        start_column: 6,
                        end_line: 14,
                        end_column: 7,
                      },
                    },
                    {
                      expr: {
                        List: [
                          {
                            expr: {
                              Atom: "map-set",
                            },
                            id: 38,
                            span: {
                              start_line: 14,
                              start_column: 10,
                              end_line: 14,
                              end_column: 16,
                            },
                          },
                          {
                            expr: {
                              Atom: "context",
                            },
                            id: 39,
                            span: {
                              start_line: 14,
                              start_column: 18,
                              end_line: 14,
                              end_column: 24,
                            },
                          },
                          {
                            expr: {
                              Atom: "function-name",
                            },
                            id: 40,
                            span: {
                              start_line: 14,
                              start_column: 26,
                              end_line: 14,
                              end_column: 38,
                            },
                          },
                          {
                            expr: {
                              List: [
                                {
                                  expr: {
                                    Atom: "tuple",
                                  },
                                  id: 42,
                                  span: {
                                    start_line: 0,
                                    start_column: 0,
                                    end_line: 0,
                                    end_column: 0,
                                  },
                                },
                                {
                                  expr: {
                                    List: [
                                      {
                                        expr: {
                                          Atom: "called",
                                        },
                                        id: 44,
                                        span: {
                                          start_line: 14,
                                          start_column: 41,
                                          end_line: 14,
                                          end_column: 46,
                                        },
                                      },
                                      {
                                        expr: {
                                          Atom: "called",
                                        },
                                        id: 45,
                                        span: {
                                          start_line: 14,
                                          start_column: 49,
                                          end_line: 14,
                                          end_column: 54,
                                        },
                                      },
                                    ],
                                  },
                                  id: 43,
                                  span: {
                                    start_line: 14,
                                    start_column: 41,
                                    end_line: 14,
                                    end_column: 54,
                                  },
                                },
                              ],
                            },
                            id: 41,
                            span: {
                              start_line: 14,
                              start_column: 40,
                              end_line: 14,
                              end_column: 55,
                            },
                          },
                        ],
                      },
                      id: 37,
                      span: {
                        start_line: 14,
                        start_column: 9,
                        end_line: 14,
                        end_column: 56,
                      },
                    },
                  ],
                },
                id: 35,
                span: {
                  start_line: 14,
                  start_column: 5,
                  end_line: 14,
                  end_column: 57,
                },
              },
            ],
          },
          id: 23,
          span: {
            start_line: 13,
            start_column: 3,
            end_line: 14,
            end_column: 58,
          },
        },
        {
          expr: {
            List: [
              {
                expr: {
                  Atom: "define-public",
                },
                id: 47,
                span: {
                  start_line: 16,
                  start_column: 2,
                  end_line: 16,
                  end_column: 14,
                },
              },
              {
                expr: {
                  List: [
                    {
                      expr: {
                        Atom: "test-mixed-traits",
                      },
                      id: 49,
                      span: {
                        start_line: 16,
                        start_column: 17,
                        end_line: 16,
                        end_column: 33,
                      },
                    },
                    {
                      expr: {
                        List: [
                          {
                            expr: {
                              Atom: "list-tuple-trait",
                            },
                            id: 51,
                            span: {
                              start_line: 17,
                              start_column: 6,
                              end_line: 17,
                              end_column: 21,
                            },
                          },
                          {
                            expr: {
                              List: [
                                {
                                  expr: {
                                    Atom: "list",
                                  },
                                  id: 53,
                                  span: {
                                    start_line: 17,
                                    start_column: 24,
                                    end_line: 17,
                                    end_column: 27,
                                  },
                                },
                                {
                                  expr: {
                                    LiteralValue: {
                                      Int: "4",
                                    },
                                  },
                                  id: 54,
                                  span: {
                                    start_line: 17,
                                    start_column: 29,
                                    end_line: 17,
                                    end_column: 29,
                                  },
                                },
                                {
                                  expr: {
                                    List: [
                                      {
                                        expr: {
                                          Atom: "tuple",
                                        },
                                        id: 56,
                                        span: {
                                          start_line: 0,
                                          start_column: 0,
                                          end_line: 0,
                                          end_column: 0,
                                        },
                                      },
                                      {
                                        expr: {
                                          List: [
                                            {
                                              expr: {
                                                Atom: "mad-inner",
                                              },
                                              id: 58,
                                              span: {
                                                start_line: 17,
                                                start_column: 33,
                                                end_line: 17,
                                                end_column: 41,
                                              },
                                            },
                                            {
                                              expr: {
                                                TraitReference: [
                                                  "ft-trait",
                                                  {
                                                    Imported: {
                                                      name: "sip-010-trait",
                                                      contract_identifier: {
                                                        issuer: [
                                                          22,
                                                          [
                                                            9, 159, 184, 137,
                                                            38, 216, 47, 48,
                                                            178, 244, 14, 175,
                                                            62, 228, 35, 203,
                                                            114, 91, 219, 59,
                                                          ],
                                                        ],
                                                        name: "sip-010-trait-ft-standard",
                                                      },
                                                    },
                                                  },
                                                ],
                                              },
                                              id: 59,
                                              span: {
                                                start_line: 17,
                                                start_column: 44,
                                                end_line: 17,
                                                end_column: 53,
                                              },
                                            },
                                          ],
                                        },
                                        id: 57,
                                        span: {
                                          start_line: 17,
                                          start_column: 33,
                                          end_line: 17,
                                          end_column: 53,
                                        },
                                      },
                                    ],
                                  },
                                  id: 55,
                                  span: {
                                    start_line: 17,
                                    start_column: 31,
                                    end_line: 17,
                                    end_column: 55,
                                  },
                                },
                              ],
                            },
                            id: 52,
                            span: {
                              start_line: 17,
                              start_column: 23,
                              end_line: 17,
                              end_column: 56,
                            },
                          },
                        ],
                      },
                      id: 50,
                      span: {
                        start_line: 17,
                        start_column: 5,
                        end_line: 17,
                        end_column: 57,
                      },
                    },
                  ],
                },
                id: 48,
                span: {
                  start_line: 16,
                  start_column: 16,
                  end_line: 18,
                  end_column: 3,
                },
              },
              {
                expr: {
                  List: [
                    {
                      expr: {
                        Atom: "ok",
                      },
                      id: 61,
                      span: {
                        start_line: 19,
                        start_column: 4,
                        end_line: 19,
                        end_column: 5,
                      },
                    },
                    {
                      expr: {
                        Atom: "true",
                      },
                      id: 62,
                      span: {
                        start_line: 19,
                        start_column: 7,
                        end_line: 19,
                        end_column: 10,
                      },
                    },
                  ],
                },
                id: 60,
                span: {
                  start_line: 19,
                  start_column: 3,
                  end_line: 19,
                  end_column: 11,
                },
              },
            ],
          },
          id: 46,
          span: {
            start_line: 16,
            start_column: 1,
            end_line: 20,
            end_column: 1,
          },
        },
      ],
      top_level_expression_sorting: [0, 1, 2, 3, 4],
      referenced_traits: {},
      implemented_traits: [],
    },
  },
  listResponseNestedTrait: {
    functionsInterfaces: [
      {
        name: "transfer",
        access: "private",
        args: [
          {
            name: "one-transfer",
            type: {
              tuple: [
                {
                  name: "amount",
                  type: "uint128",
                },
                {
                  name: "to",
                  type: "principal",
                },
                {
                  name: "token",
                  type: "trait_reference",
                },
              ],
            },
          },
        ],
        outputs: {
          type: {
            response: {
              ok: "bool",
              error: "uint128",
            },
          },
        },
      },
      {
        name: "send-tokens",
        access: "public",
        args: [
          {
            name: "transfers",
            type: {
              list: {
                type: {
                  tuple: [
                    {
                      name: "amount",
                      type: "uint128",
                    },
                    {
                      name: "to",
                      type: "principal",
                    },
                    {
                      name: "token",
                      type: "trait_reference",
                    },
                  ],
                },
                length: 5,
              },
            },
          },
        ],
        outputs: {
          type: {
            response: {
              ok: {
                list: {
                  type: {
                    response: {
                      ok: "bool",
                      error: "uint128",
                    },
                  },
                  length: 5,
                },
              },
              error: "none",
            },
          },
        },
      },
      {
        name: "test-list-response",
        access: "public",
        args: [
          {
            name: "token-list",
            type: {
              list: {
                type: {
                  response: {
                    ok: "trait_reference",
                    error: "uint128",
                  },
                },
                length: 5,
              },
            },
          },
          {
            name: "to",
            type: "principal",
          },
          {
            name: "amount",
            type: "uint128",
          },
        ],
        outputs: {
          type: {
            response: {
              ok: "bool",
              error: "none",
            },
          },
        },
      },
      {
        name: "update-context",
        access: "public",
        args: [
          {
            name: "function-name",
            type: {
              "string-ascii": {
                length: 100,
              },
            },
          },
          {
            name: "called",
            type: "uint128",
          },
        ],
        outputs: {
          type: {
            response: {
              ok: "bool",
              error: "none",
            },
          },
        },
      },
      {
        name: "invariant-token-supply-vs-balance",
        access: "read_only",
        args: [
          {
            name: "address",
            type: "principal",
          },
        ],
        outputs: {
          type: "bool",
        },
      },
    ],
    ast: {
      contract_identifier: {
        issuer: [
          26,
          [
            109, 120, 222, 123, 6, 37, 223, 191, 193, 108, 58, 138, 87, 53, 246,
            220, 61, 195, 242, 206,
          ],
        ],
        name: "trait-contract",
      },
      pre_expressions: [],
      expressions: [
        {
          expr: {
            List: [
              {
                expr: {
                  Atom: "use-trait",
                },
                id: 2,
                span: {
                  start_line: 1,
                  start_column: 2,
                  end_line: 1,
                  end_column: 10,
                },
              },
              {
                expr: {
                  Atom: "ft-trait",
                },
                id: 3,
                span: {
                  start_line: 1,
                  start_column: 12,
                  end_line: 1,
                  end_column: 19,
                },
              },
              {
                expr: {
                  Field: {
                    name: "sip-010-trait",
                    contract_identifier: {
                      issuer: [
                        22,
                        [
                          9, 159, 184, 137, 38, 216, 47, 48, 178, 244, 14, 175,
                          62, 228, 35, 203, 114, 91, 219, 59,
                        ],
                      ],
                      name: "sip-010-trait-ft-standard",
                    },
                  },
                },
                id: 4,
                span: {
                  start_line: 1,
                  start_column: 21,
                  end_line: 1,
                  end_column: 101,
                },
              },
            ],
          },
          id: 1,
          span: {
            start_line: 1,
            start_column: 1,
            end_line: 1,
            end_column: 102,
          },
        },
        {
          expr: {
            List: [
              {
                expr: {
                  Atom: "define-private",
                },
                id: 6,
                span: {
                  start_line: 9,
                  start_column: 2,
                  end_line: 9,
                  end_column: 15,
                },
              },
              {
                expr: {
                  List: [
                    {
                      expr: {
                        Atom: "transfer",
                      },
                      id: 8,
                      span: {
                        start_line: 9,
                        start_column: 18,
                        end_line: 9,
                        end_column: 25,
                      },
                    },
                    {
                      expr: {
                        List: [
                          {
                            expr: {
                              Atom: "one-transfer",
                            },
                            id: 10,
                            span: {
                              start_line: 10,
                              start_column: 6,
                              end_line: 10,
                              end_column: 17,
                            },
                          },
                          {
                            expr: {
                              List: [
                                {
                                  expr: {
                                    Atom: "tuple",
                                  },
                                  id: 12,
                                  span: {
                                    start_line: 0,
                                    start_column: 0,
                                    end_line: 0,
                                    end_column: 0,
                                  },
                                },
                                {
                                  expr: {
                                    List: [
                                      {
                                        expr: {
                                          Atom: "token",
                                        },
                                        id: 14,
                                        span: {
                                          start_line: 10,
                                          start_column: 20,
                                          end_line: 10,
                                          end_column: 24,
                                        },
                                      },
                                      {
                                        expr: {
                                          TraitReference: [
                                            "ft-trait",
                                            {
                                              Imported: {
                                                name: "sip-010-trait",
                                                contract_identifier: {
                                                  issuer: [
                                                    22,
                                                    [
                                                      9, 159, 184, 137, 38, 216,
                                                      47, 48, 178, 244, 14, 175,
                                                      62, 228, 35, 203, 114, 91,
                                                      219, 59,
                                                    ],
                                                  ],
                                                  name: "sip-010-trait-ft-standard",
                                                },
                                              },
                                            },
                                          ],
                                        },
                                        id: 15,
                                        span: {
                                          start_line: 10,
                                          start_column: 27,
                                          end_line: 10,
                                          end_column: 36,
                                        },
                                      },
                                    ],
                                  },
                                  id: 13,
                                  span: {
                                    start_line: 10,
                                    start_column: 20,
                                    end_line: 10,
                                    end_column: 36,
                                  },
                                },
                                {
                                  expr: {
                                    List: [
                                      {
                                        expr: {
                                          Atom: "to",
                                        },
                                        id: 17,
                                        span: {
                                          start_line: 10,
                                          start_column: 39,
                                          end_line: 10,
                                          end_column: 40,
                                        },
                                      },
                                      {
                                        expr: {
                                          Atom: "principal",
                                        },
                                        id: 18,
                                        span: {
                                          start_line: 10,
                                          start_column: 43,
                                          end_line: 10,
                                          end_column: 51,
                                        },
                                      },
                                    ],
                                  },
                                  id: 16,
                                  span: {
                                    start_line: 10,
                                    start_column: 39,
                                    end_line: 10,
                                    end_column: 51,
                                  },
                                },
                                {
                                  expr: {
                                    List: [
                                      {
                                        expr: {
                                          Atom: "amount",
                                        },
                                        id: 20,
                                        span: {
                                          start_line: 10,
                                          start_column: 54,
                                          end_line: 10,
                                          end_column: 59,
                                        },
                                      },
                                      {
                                        expr: {
                                          Atom: "uint",
                                        },
                                        id: 21,
                                        span: {
                                          start_line: 10,
                                          start_column: 62,
                                          end_line: 10,
                                          end_column: 65,
                                        },
                                      },
                                    ],
                                  },
                                  id: 19,
                                  span: {
                                    start_line: 10,
                                    start_column: 54,
                                    end_line: 10,
                                    end_column: 65,
                                  },
                                },
                              ],
                            },
                            id: 11,
                            span: {
                              start_line: 10,
                              start_column: 19,
                              end_line: 10,
                              end_column: 66,
                            },
                          },
                        ],
                      },
                      id: 9,
                      span: {
                        start_line: 10,
                        start_column: 5,
                        end_line: 10,
                        end_column: 67,
                      },
                    },
                  ],
                },
                id: 7,
                span: {
                  start_line: 9,
                  start_column: 17,
                  end_line: 11,
                  end_column: 3,
                },
              },
              {
                expr: {
                  List: [
                    {
                      expr: {
                        Atom: "let",
                      },
                      id: 23,
                      span: {
                        start_line: 12,
                        start_column: 4,
                        end_line: 12,
                        end_column: 6,
                      },
                    },
                    {
                      expr: {
                        List: [
                          {
                            expr: {
                              List: [
                                {
                                  expr: {
                                    Atom: "ft",
                                  },
                                  id: 26,
                                  span: {
                                    start_line: 14,
                                    start_column: 8,
                                    end_line: 14,
                                    end_column: 9,
                                  },
                                },
                                {
                                  expr: {
                                    List: [
                                      {
                                        expr: {
                                          Atom: "get",
                                        },
                                        id: 28,
                                        span: {
                                          start_line: 14,
                                          start_column: 12,
                                          end_line: 14,
                                          end_column: 14,
                                        },
                                      },
                                      {
                                        expr: {
                                          Atom: "token",
                                        },
                                        id: 29,
                                        span: {
                                          start_line: 14,
                                          start_column: 16,
                                          end_line: 14,
                                          end_column: 20,
                                        },
                                      },
                                      {
                                        expr: {
                                          Atom: "one-transfer",
                                        },
                                        id: 30,
                                        span: {
                                          start_line: 14,
                                          start_column: 22,
                                          end_line: 14,
                                          end_column: 33,
                                        },
                                      },
                                    ],
                                  },
                                  id: 27,
                                  span: {
                                    start_line: 14,
                                    start_column: 11,
                                    end_line: 14,
                                    end_column: 34,
                                  },
                                },
                              ],
                            },
                            id: 25,
                            span: {
                              start_line: 14,
                              start_column: 7,
                              end_line: 14,
                              end_column: 35,
                            },
                          },
                          {
                            expr: {
                              List: [
                                {
                                  expr: {
                                    Atom: "to",
                                  },
                                  id: 32,
                                  span: {
                                    start_line: 15,
                                    start_column: 8,
                                    end_line: 15,
                                    end_column: 9,
                                  },
                                },
                                {
                                  expr: {
                                    List: [
                                      {
                                        expr: {
                                          Atom: "get",
                                        },
                                        id: 34,
                                        span: {
                                          start_line: 15,
                                          start_column: 12,
                                          end_line: 15,
                                          end_column: 14,
                                        },
                                      },
                                      {
                                        expr: {
                                          Atom: "to",
                                        },
                                        id: 35,
                                        span: {
                                          start_line: 15,
                                          start_column: 16,
                                          end_line: 15,
                                          end_column: 17,
                                        },
                                      },
                                      {
                                        expr: {
                                          Atom: "one-transfer",
                                        },
                                        id: 36,
                                        span: {
                                          start_line: 15,
                                          start_column: 19,
                                          end_line: 15,
                                          end_column: 30,
                                        },
                                      },
                                    ],
                                  },
                                  id: 33,
                                  span: {
                                    start_line: 15,
                                    start_column: 11,
                                    end_line: 15,
                                    end_column: 31,
                                  },
                                },
                              ],
                            },
                            id: 31,
                            span: {
                              start_line: 15,
                              start_column: 7,
                              end_line: 15,
                              end_column: 32,
                            },
                          },
                          {
                            expr: {
                              List: [
                                {
                                  expr: {
                                    Atom: "amount",
                                  },
                                  id: 38,
                                  span: {
                                    start_line: 16,
                                    start_column: 8,
                                    end_line: 16,
                                    end_column: 13,
                                  },
                                },
                                {
                                  expr: {
                                    List: [
                                      {
                                        expr: {
                                          Atom: "get",
                                        },
                                        id: 40,
                                        span: {
                                          start_line: 16,
                                          start_column: 16,
                                          end_line: 16,
                                          end_column: 18,
                                        },
                                      },
                                      {
                                        expr: {
                                          Atom: "amount",
                                        },
                                        id: 41,
                                        span: {
                                          start_line: 16,
                                          start_column: 20,
                                          end_line: 16,
                                          end_column: 25,
                                        },
                                      },
                                      {
                                        expr: {
                                          Atom: "one-transfer",
                                        },
                                        id: 42,
                                        span: {
                                          start_line: 16,
                                          start_column: 27,
                                          end_line: 16,
                                          end_column: 38,
                                        },
                                      },
                                    ],
                                  },
                                  id: 39,
                                  span: {
                                    start_line: 16,
                                    start_column: 15,
                                    end_line: 16,
                                    end_column: 39,
                                  },
                                },
                              ],
                            },
                            id: 37,
                            span: {
                              start_line: 16,
                              start_column: 7,
                              end_line: 16,
                              end_column: 40,
                            },
                          },
                        ],
                      },
                      id: 24,
                      span: {
                        start_line: 13,
                        start_column: 5,
                        end_line: 17,
                        end_column: 5,
                      },
                    },
                    {
                      expr: {
                        List: [
                          {
                            expr: {
                              Atom: "contract-call?",
                            },
                            id: 44,
                            span: {
                              start_line: 18,
                              start_column: 6,
                              end_line: 18,
                              end_column: 19,
                            },
                          },
                          {
                            expr: {
                              Atom: "ft",
                            },
                            id: 45,
                            span: {
                              start_line: 18,
                              start_column: 21,
                              end_line: 18,
                              end_column: 22,
                            },
                          },
                          {
                            expr: {
                              Atom: "transfer",
                            },
                            id: 46,
                            span: {
                              start_line: 18,
                              start_column: 24,
                              end_line: 18,
                              end_column: 31,
                            },
                          },
                          {
                            expr: {
                              Atom: "amount",
                            },
                            id: 47,
                            span: {
                              start_line: 18,
                              start_column: 33,
                              end_line: 18,
                              end_column: 38,
                            },
                          },
                          {
                            expr: {
                              Atom: "tx-sender",
                            },
                            id: 48,
                            span: {
                              start_line: 18,
                              start_column: 40,
                              end_line: 18,
                              end_column: 48,
                            },
                          },
                          {
                            expr: {
                              Atom: "to",
                            },
                            id: 49,
                            span: {
                              start_line: 18,
                              start_column: 50,
                              end_line: 18,
                              end_column: 51,
                            },
                          },
                          {
                            expr: {
                              Atom: "none",
                            },
                            id: 50,
                            span: {
                              start_line: 18,
                              start_column: 53,
                              end_line: 18,
                              end_column: 56,
                            },
                          },
                        ],
                      },
                      id: 43,
                      span: {
                        start_line: 18,
                        start_column: 5,
                        end_line: 18,
                        end_column: 57,
                      },
                    },
                  ],
                },
                id: 22,
                span: {
                  start_line: 12,
                  start_column: 3,
                  end_line: 18,
                  end_column: 58,
                },
              },
            ],
          },
          id: 5,
          span: {
            start_line: 9,
            start_column: 1,
            end_line: 19,
            end_column: 1,
          },
        },
        {
          expr: {
            List: [
              {
                expr: {
                  Atom: "define-public",
                },
                id: 52,
                span: {
                  start_line: 3,
                  start_column: 2,
                  end_line: 3,
                  end_column: 14,
                },
              },
              {
                expr: {
                  List: [
                    {
                      expr: {
                        Atom: "send-tokens",
                      },
                      id: 54,
                      span: {
                        start_line: 3,
                        start_column: 17,
                        end_line: 3,
                        end_column: 27,
                      },
                    },
                    {
                      expr: {
                        List: [
                          {
                            expr: {
                              Atom: "transfers",
                            },
                            id: 56,
                            span: {
                              start_line: 4,
                              start_column: 6,
                              end_line: 4,
                              end_column: 14,
                            },
                          },
                          {
                            expr: {
                              List: [
                                {
                                  expr: {
                                    Atom: "list",
                                  },
                                  id: 58,
                                  span: {
                                    start_line: 4,
                                    start_column: 17,
                                    end_line: 4,
                                    end_column: 20,
                                  },
                                },
                                {
                                  expr: {
                                    LiteralValue: {
                                      Int: "5",
                                    },
                                  },
                                  id: 59,
                                  span: {
                                    start_line: 4,
                                    start_column: 22,
                                    end_line: 4,
                                    end_column: 22,
                                  },
                                },
                                {
                                  expr: {
                                    List: [
                                      {
                                        expr: {
                                          Atom: "tuple",
                                        },
                                        id: 61,
                                        span: {
                                          start_line: 0,
                                          start_column: 0,
                                          end_line: 0,
                                          end_column: 0,
                                        },
                                      },
                                      {
                                        expr: {
                                          List: [
                                            {
                                              expr: {
                                                Atom: "token",
                                              },
                                              id: 63,
                                              span: {
                                                start_line: 4,
                                                start_column: 25,
                                                end_line: 4,
                                                end_column: 29,
                                              },
                                            },
                                            {
                                              expr: {
                                                TraitReference: [
                                                  "ft-trait",
                                                  {
                                                    Imported: {
                                                      name: "sip-010-trait",
                                                      contract_identifier: {
                                                        issuer: [
                                                          22,
                                                          [
                                                            9, 159, 184, 137,
                                                            38, 216, 47, 48,
                                                            178, 244, 14, 175,
                                                            62, 228, 35, 203,
                                                            114, 91, 219, 59,
                                                          ],
                                                        ],
                                                        name: "sip-010-trait-ft-standard",
                                                      },
                                                    },
                                                  },
                                                ],
                                              },
                                              id: 64,
                                              span: {
                                                start_line: 4,
                                                start_column: 32,
                                                end_line: 4,
                                                end_column: 41,
                                              },
                                            },
                                          ],
                                        },
                                        id: 62,
                                        span: {
                                          start_line: 4,
                                          start_column: 25,
                                          end_line: 4,
                                          end_column: 41,
                                        },
                                      },
                                      {
                                        expr: {
                                          List: [
                                            {
                                              expr: {
                                                Atom: "to",
                                              },
                                              id: 66,
                                              span: {
                                                start_line: 4,
                                                start_column: 44,
                                                end_line: 4,
                                                end_column: 45,
                                              },
                                            },
                                            {
                                              expr: {
                                                Atom: "principal",
                                              },
                                              id: 67,
                                              span: {
                                                start_line: 4,
                                                start_column: 48,
                                                end_line: 4,
                                                end_column: 56,
                                              },
                                            },
                                          ],
                                        },
                                        id: 65,
                                        span: {
                                          start_line: 4,
                                          start_column: 44,
                                          end_line: 4,
                                          end_column: 56,
                                        },
                                      },
                                      {
                                        expr: {
                                          List: [
                                            {
                                              expr: {
                                                Atom: "amount",
                                              },
                                              id: 69,
                                              span: {
                                                start_line: 4,
                                                start_column: 59,
                                                end_line: 4,
                                                end_column: 64,
                                              },
                                            },
                                            {
                                              expr: {
                                                Atom: "uint",
                                              },
                                              id: 70,
                                              span: {
                                                start_line: 4,
                                                start_column: 67,
                                                end_line: 4,
                                                end_column: 70,
                                              },
                                            },
                                          ],
                                        },
                                        id: 68,
                                        span: {
                                          start_line: 4,
                                          start_column: 59,
                                          end_line: 4,
                                          end_column: 70,
                                        },
                                      },
                                    ],
                                  },
                                  id: 60,
                                  span: {
                                    start_line: 4,
                                    start_column: 24,
                                    end_line: 4,
                                    end_column: 71,
                                  },
                                },
                              ],
                            },
                            id: 57,
                            span: {
                              start_line: 4,
                              start_column: 16,
                              end_line: 4,
                              end_column: 72,
                            },
                          },
                        ],
                      },
                      id: 55,
                      span: {
                        start_line: 4,
                        start_column: 5,
                        end_line: 4,
                        end_column: 73,
                      },
                    },
                  ],
                },
                id: 53,
                span: {
                  start_line: 3,
                  start_column: 16,
                  end_line: 5,
                  end_column: 3,
                },
              },
              {
                expr: {
                  List: [
                    {
                      expr: {
                        Atom: "ok",
                      },
                      id: 72,
                      span: {
                        start_line: 6,
                        start_column: 4,
                        end_line: 6,
                        end_column: 5,
                      },
                    },
                    {
                      expr: {
                        List: [
                          {
                            expr: {
                              Atom: "map",
                            },
                            id: 74,
                            span: {
                              start_line: 6,
                              start_column: 8,
                              end_line: 6,
                              end_column: 10,
                            },
                          },
                          {
                            expr: {
                              Atom: "transfer",
                            },
                            id: 75,
                            span: {
                              start_line: 6,
                              start_column: 12,
                              end_line: 6,
                              end_column: 19,
                            },
                          },
                          {
                            expr: {
                              Atom: "transfers",
                            },
                            id: 76,
                            span: {
                              start_line: 6,
                              start_column: 21,
                              end_line: 6,
                              end_column: 29,
                            },
                          },
                        ],
                      },
                      id: 73,
                      span: {
                        start_line: 6,
                        start_column: 7,
                        end_line: 6,
                        end_column: 30,
                      },
                    },
                  ],
                },
                id: 71,
                span: {
                  start_line: 6,
                  start_column: 3,
                  end_line: 6,
                  end_column: 31,
                },
              },
            ],
          },
          id: 51,
          span: {
            start_line: 3,
            start_column: 1,
            end_line: 7,
            end_column: 1,
          },
        },
        {
          expr: {
            List: [
              {
                expr: {
                  Atom: "define-map",
                },
                id: 78,
                span: {
                  start_line: 22,
                  start_column: 2,
                  end_line: 22,
                  end_column: 11,
                },
              },
              {
                expr: {
                  Atom: "context",
                },
                id: 79,
                span: {
                  start_line: 22,
                  start_column: 13,
                  end_line: 22,
                  end_column: 19,
                },
              },
              {
                expr: {
                  List: [
                    {
                      expr: {
                        Atom: "string-ascii",
                      },
                      id: 81,
                      span: {
                        start_line: 22,
                        start_column: 22,
                        end_line: 22,
                        end_column: 33,
                      },
                    },
                    {
                      expr: {
                        LiteralValue: {
                          Int: "100",
                        },
                      },
                      id: 82,
                      span: {
                        start_line: 22,
                        start_column: 35,
                        end_line: 22,
                        end_column: 37,
                      },
                    },
                  ],
                },
                id: 80,
                span: {
                  start_line: 22,
                  start_column: 21,
                  end_line: 22,
                  end_column: 38,
                },
              },
              {
                expr: {
                  List: [
                    {
                      expr: {
                        Atom: "tuple",
                      },
                      id: 84,
                      span: {
                        start_line: 0,
                        start_column: 0,
                        end_line: 0,
                        end_column: 0,
                      },
                    },
                    {
                      expr: {
                        List: [
                          {
                            expr: {
                              Atom: "called",
                            },
                            id: 86,
                            span: {
                              start_line: 23,
                              start_column: 5,
                              end_line: 23,
                              end_column: 10,
                            },
                          },
                          {
                            expr: {
                              Atom: "uint",
                            },
                            id: 87,
                            span: {
                              start_line: 23,
                              start_column: 13,
                              end_line: 23,
                              end_column: 16,
                            },
                            post_comments: [
                              [
                                "other data",
                                {
                                  start_line: 24,
                                  start_column: 5,
                                  end_line: 24,
                                  end_column: 17,
                                },
                              ],
                            ],
                          },
                        ],
                      },
                      id: 85,
                      span: {
                        start_line: 23,
                        start_column: 5,
                        end_line: 23,
                        end_column: 16,
                      },
                    },
                  ],
                },
                id: 83,
                span: {
                  start_line: 22,
                  start_column: 40,
                  end_line: 25,
                  end_column: 3,
                },
              },
            ],
          },
          id: 77,
          span: {
            start_line: 22,
            start_column: 1,
            end_line: 25,
            end_column: 4,
          },
        },
        {
          expr: {
            List: [
              {
                expr: {
                  Atom: "define-public",
                },
                id: 89,
                span: {
                  start_line: 27,
                  start_column: 4,
                  end_line: 27,
                  end_column: 16,
                },
              },
              {
                expr: {
                  List: [
                    {
                      expr: {
                        Atom: "update-context",
                      },
                      id: 91,
                      span: {
                        start_line: 27,
                        start_column: 19,
                        end_line: 27,
                        end_column: 32,
                      },
                    },
                    {
                      expr: {
                        List: [
                          {
                            expr: {
                              Atom: "function-name",
                            },
                            id: 93,
                            span: {
                              start_line: 27,
                              start_column: 35,
                              end_line: 27,
                              end_column: 47,
                            },
                          },
                          {
                            expr: {
                              List: [
                                {
                                  expr: {
                                    Atom: "string-ascii",
                                  },
                                  id: 95,
                                  span: {
                                    start_line: 27,
                                    start_column: 50,
                                    end_line: 27,
                                    end_column: 61,
                                  },
                                },
                                {
                                  expr: {
                                    LiteralValue: {
                                      Int: "100",
                                    },
                                  },
                                  id: 96,
                                  span: {
                                    start_line: 27,
                                    start_column: 63,
                                    end_line: 27,
                                    end_column: 65,
                                  },
                                },
                              ],
                            },
                            id: 94,
                            span: {
                              start_line: 27,
                              start_column: 49,
                              end_line: 27,
                              end_column: 66,
                            },
                          },
                        ],
                      },
                      id: 92,
                      span: {
                        start_line: 27,
                        start_column: 34,
                        end_line: 27,
                        end_column: 67,
                      },
                    },
                    {
                      expr: {
                        List: [
                          {
                            expr: {
                              Atom: "called",
                            },
                            id: 98,
                            span: {
                              start_line: 27,
                              start_column: 70,
                              end_line: 27,
                              end_column: 75,
                            },
                          },
                          {
                            expr: {
                              Atom: "uint",
                            },
                            id: 99,
                            span: {
                              start_line: 27,
                              start_column: 77,
                              end_line: 27,
                              end_column: 80,
                            },
                          },
                        ],
                      },
                      id: 97,
                      span: {
                        start_line: 27,
                        start_column: 69,
                        end_line: 27,
                        end_column: 81,
                      },
                    },
                  ],
                },
                id: 90,
                span: {
                  start_line: 27,
                  start_column: 18,
                  end_line: 27,
                  end_column: 82,
                },
              },
              {
                expr: {
                  List: [
                    {
                      expr: {
                        Atom: "ok",
                      },
                      id: 101,
                      span: {
                        start_line: 28,
                        start_column: 6,
                        end_line: 28,
                        end_column: 7,
                      },
                    },
                    {
                      expr: {
                        List: [
                          {
                            expr: {
                              Atom: "map-set",
                            },
                            id: 103,
                            span: {
                              start_line: 28,
                              start_column: 10,
                              end_line: 28,
                              end_column: 16,
                            },
                          },
                          {
                            expr: {
                              Atom: "context",
                            },
                            id: 104,
                            span: {
                              start_line: 28,
                              start_column: 18,
                              end_line: 28,
                              end_column: 24,
                            },
                          },
                          {
                            expr: {
                              Atom: "function-name",
                            },
                            id: 105,
                            span: {
                              start_line: 28,
                              start_column: 26,
                              end_line: 28,
                              end_column: 38,
                            },
                          },
                          {
                            expr: {
                              List: [
                                {
                                  expr: {
                                    Atom: "tuple",
                                  },
                                  id: 107,
                                  span: {
                                    start_line: 0,
                                    start_column: 0,
                                    end_line: 0,
                                    end_column: 0,
                                  },
                                },
                                {
                                  expr: {
                                    List: [
                                      {
                                        expr: {
                                          Atom: "called",
                                        },
                                        id: 109,
                                        span: {
                                          start_line: 28,
                                          start_column: 41,
                                          end_line: 28,
                                          end_column: 46,
                                        },
                                      },
                                      {
                                        expr: {
                                          Atom: "called",
                                        },
                                        id: 110,
                                        span: {
                                          start_line: 28,
                                          start_column: 49,
                                          end_line: 28,
                                          end_column: 54,
                                        },
                                      },
                                    ],
                                  },
                                  id: 108,
                                  span: {
                                    start_line: 28,
                                    start_column: 41,
                                    end_line: 28,
                                    end_column: 54,
                                  },
                                },
                              ],
                            },
                            id: 106,
                            span: {
                              start_line: 28,
                              start_column: 40,
                              end_line: 28,
                              end_column: 55,
                            },
                          },
                        ],
                      },
                      id: 102,
                      span: {
                        start_line: 28,
                        start_column: 9,
                        end_line: 28,
                        end_column: 56,
                      },
                    },
                  ],
                },
                id: 100,
                span: {
                  start_line: 28,
                  start_column: 5,
                  end_line: 28,
                  end_column: 57,
                },
              },
            ],
          },
          id: 88,
          span: {
            start_line: 27,
            start_column: 3,
            end_line: 28,
            end_column: 58,
          },
        },
        {
          expr: {
            List: [
              {
                expr: {
                  Atom: "define-read-only",
                },
                id: 112,
                span: {
                  start_line: 32,
                  start_column: 2,
                  end_line: 32,
                  end_column: 17,
                },
              },
              {
                expr: {
                  List: [
                    {
                      expr: {
                        Atom: "invariant-token-supply-vs-balance",
                      },
                      id: 114,
                      span: {
                        start_line: 32,
                        start_column: 20,
                        end_line: 32,
                        end_column: 52,
                      },
                    },
                    {
                      expr: {
                        List: [
                          {
                            expr: {
                              Atom: "address",
                            },
                            id: 116,
                            span: {
                              start_line: 32,
                              start_column: 55,
                              end_line: 32,
                              end_column: 61,
                            },
                          },
                          {
                            expr: {
                              Atom: "principal",
                            },
                            id: 117,
                            span: {
                              start_line: 32,
                              start_column: 63,
                              end_line: 32,
                              end_column: 71,
                            },
                          },
                        ],
                      },
                      id: 115,
                      span: {
                        start_line: 32,
                        start_column: 54,
                        end_line: 32,
                        end_column: 72,
                      },
                    },
                  ],
                },
                id: 113,
                span: {
                  start_line: 32,
                  start_column: 19,
                  end_line: 32,
                  end_column: 73,
                },
              },
              {
                expr: {
                  List: [
                    {
                      expr: {
                        Atom: "let",
                      },
                      id: 119,
                      span: {
                        start_line: 33,
                        start_column: 4,
                        end_line: 33,
                        end_column: 6,
                      },
                    },
                    {
                      expr: {
                        List: [
                          {
                            expr: {
                              List: [
                                {
                                  expr: {
                                    Atom: "total-supply",
                                  },
                                  id: 122,
                                  span: {
                                    start_line: 35,
                                    start_column: 8,
                                    end_line: 35,
                                    end_column: 19,
                                  },
                                },
                                {
                                  expr: {
                                    List: [
                                      {
                                        expr: {
                                          Atom: "unwrap-panic",
                                        },
                                        id: 124,
                                        span: {
                                          start_line: 36,
                                          start_column: 10,
                                          end_line: 36,
                                          end_column: 21,
                                        },
                                      },
                                      {
                                        expr: {
                                          List: [
                                            {
                                              expr: {
                                                Atom: "contract-call?",
                                              },
                                              id: 126,
                                              span: {
                                                start_line: 36,
                                                start_column: 24,
                                                end_line: 36,
                                                end_column: 37,
                                              },
                                            },
                                            {
                                              expr: {
                                                LiteralValue: {
                                                  Principal: {
                                                    Contract: {
                                                      issuer: [
                                                        26,
                                                        [
                                                          109, 120, 222, 123, 6,
                                                          37, 223, 191, 193,
                                                          108, 58, 138, 87, 53,
                                                          246, 220, 61, 195,
                                                          242, 206,
                                                        ],
                                                      ],
                                                      name: "rendezvous-token",
                                                    },
                                                  },
                                                },
                                              },
                                              id: 127,
                                              span: {
                                                start_line: 36,
                                                start_column: 39,
                                                end_line: 36,
                                                end_column: 55,
                                              },
                                            },
                                            {
                                              expr: {
                                                Atom: "get-total-supply",
                                              },
                                              id: 128,
                                              span: {
                                                start_line: 36,
                                                start_column: 57,
                                                end_line: 36,
                                                end_column: 72,
                                              },
                                            },
                                          ],
                                        },
                                        id: 125,
                                        span: {
                                          start_line: 36,
                                          start_column: 23,
                                          end_line: 36,
                                          end_column: 73,
                                        },
                                      },
                                    ],
                                  },
                                  id: 123,
                                  span: {
                                    start_line: 36,
                                    start_column: 9,
                                    end_line: 36,
                                    end_column: 74,
                                  },
                                },
                              ],
                            },
                            id: 121,
                            span: {
                              start_line: 35,
                              start_column: 7,
                              end_line: 36,
                              end_column: 75,
                            },
                          },
                          {
                            expr: {
                              List: [
                                {
                                  expr: {
                                    Atom: "user-balance",
                                  },
                                  id: 130,
                                  span: {
                                    start_line: 37,
                                    start_column: 8,
                                    end_line: 37,
                                    end_column: 19,
                                  },
                                },
                                {
                                  expr: {
                                    List: [
                                      {
                                        expr: {
                                          Atom: "unwrap-panic",
                                        },
                                        id: 132,
                                        span: {
                                          start_line: 38,
                                          start_column: 10,
                                          end_line: 38,
                                          end_column: 21,
                                        },
                                      },
                                      {
                                        expr: {
                                          List: [
                                            {
                                              expr: {
                                                Atom: "contract-call?",
                                              },
                                              id: 134,
                                              span: {
                                                start_line: 39,
                                                start_column: 12,
                                                end_line: 39,
                                                end_column: 25,
                                              },
                                            },
                                            {
                                              expr: {
                                                LiteralValue: {
                                                  Principal: {
                                                    Contract: {
                                                      issuer: [
                                                        26,
                                                        [
                                                          109, 120, 222, 123, 6,
                                                          37, 223, 191, 193,
                                                          108, 58, 138, 87, 53,
                                                          246, 220, 61, 195,
                                                          242, 206,
                                                        ],
                                                      ],
                                                      name: "rendezvous-token",
                                                    },
                                                  },
                                                },
                                              },
                                              id: 135,
                                              span: {
                                                start_line: 40,
                                                start_column: 13,
                                                end_line: 40,
                                                end_column: 29,
                                              },
                                            },
                                            {
                                              expr: {
                                                Atom: "get-balance",
                                              },
                                              id: 136,
                                              span: {
                                                start_line: 41,
                                                start_column: 13,
                                                end_line: 41,
                                                end_column: 23,
                                              },
                                            },
                                            {
                                              expr: {
                                                Atom: "address",
                                              },
                                              id: 137,
                                              span: {
                                                start_line: 42,
                                                start_column: 13,
                                                end_line: 42,
                                                end_column: 19,
                                              },
                                            },
                                          ],
                                        },
                                        id: 133,
                                        span: {
                                          start_line: 39,
                                          start_column: 11,
                                          end_line: 43,
                                          end_column: 11,
                                        },
                                      },
                                    ],
                                  },
                                  id: 131,
                                  span: {
                                    start_line: 38,
                                    start_column: 9,
                                    end_line: 44,
                                    end_column: 9,
                                  },
                                },
                              ],
                            },
                            id: 129,
                            span: {
                              start_line: 37,
                              start_column: 7,
                              end_line: 45,
                              end_column: 7,
                            },
                          },
                        ],
                      },
                      id: 120,
                      span: {
                        start_line: 34,
                        start_column: 5,
                        end_line: 46,
                        end_column: 5,
                      },
                    },
                    {
                      expr: {
                        List: [
                          {
                            expr: {
                              Atom: "<=",
                            },
                            id: 139,
                            span: {
                              start_line: 47,
                              start_column: 6,
                              end_line: 47,
                              end_column: 7,
                            },
                          },
                          {
                            expr: {
                              Atom: "user-balance",
                            },
                            id: 140,
                            span: {
                              start_line: 47,
                              start_column: 9,
                              end_line: 47,
                              end_column: 20,
                            },
                          },
                          {
                            expr: {
                              Atom: "total-supply",
                            },
                            id: 141,
                            span: {
                              start_line: 47,
                              start_column: 22,
                              end_line: 47,
                              end_column: 33,
                            },
                          },
                        ],
                      },
                      id: 138,
                      span: {
                        start_line: 47,
                        start_column: 5,
                        end_line: 47,
                        end_column: 34,
                      },
                    },
                  ],
                },
                id: 118,
                span: {
                  start_line: 33,
                  start_column: 3,
                  end_line: 48,
                  end_column: 3,
                },
              },
            ],
          },
          id: 111,
          span: {
            start_line: 32,
            start_column: 1,
            end_line: 49,
            end_column: 1,
          },
          pre_comments: [
            [
              "Invariants",
              {
                start_line: 30,
                start_column: 1,
                end_line: 30,
                end_column: 13,
              },
            ],
          ],
        },
        {
          expr: {
            List: [
              {
                expr: {
                  Atom: "define-public",
                },
                id: 143,
                span: {
                  start_line: 54,
                  start_column: 2,
                  end_line: 54,
                  end_column: 14,
                },
              },
              {
                expr: {
                  List: [
                    {
                      expr: {
                        Atom: "test-list-response",
                      },
                      id: 145,
                      span: {
                        start_line: 54,
                        start_column: 17,
                        end_line: 54,
                        end_column: 34,
                      },
                    },
                    {
                      expr: {
                        List: [
                          {
                            expr: {
                              Atom: "token-list",
                            },
                            id: 147,
                            span: {
                              start_line: 55,
                              start_column: 6,
                              end_line: 55,
                              end_column: 15,
                            },
                          },
                          {
                            expr: {
                              List: [
                                {
                                  expr: {
                                    Atom: "list",
                                  },
                                  id: 149,
                                  span: {
                                    start_line: 55,
                                    start_column: 18,
                                    end_line: 55,
                                    end_column: 21,
                                  },
                                },
                                {
                                  expr: {
                                    LiteralValue: {
                                      Int: "5",
                                    },
                                  },
                                  id: 150,
                                  span: {
                                    start_line: 55,
                                    start_column: 23,
                                    end_line: 55,
                                    end_column: 23,
                                  },
                                },
                                {
                                  expr: {
                                    List: [
                                      {
                                        expr: {
                                          Atom: "response",
                                        },
                                        id: 152,
                                        span: {
                                          start_line: 55,
                                          start_column: 26,
                                          end_line: 55,
                                          end_column: 33,
                                        },
                                      },
                                      {
                                        expr: {
                                          TraitReference: [
                                            "ft-trait",
                                            {
                                              Imported: {
                                                name: "sip-010-trait",
                                                contract_identifier: {
                                                  issuer: [
                                                    22,
                                                    [
                                                      9, 159, 184, 137, 38, 216,
                                                      47, 48, 178, 244, 14, 175,
                                                      62, 228, 35, 203, 114, 91,
                                                      219, 59,
                                                    ],
                                                  ],
                                                  name: "sip-010-trait-ft-standard",
                                                },
                                              },
                                            },
                                          ],
                                        },
                                        id: 153,
                                        span: {
                                          start_line: 55,
                                          start_column: 35,
                                          end_line: 55,
                                          end_column: 44,
                                        },
                                      },
                                      {
                                        expr: {
                                          Atom: "uint",
                                        },
                                        id: 154,
                                        span: {
                                          start_line: 55,
                                          start_column: 46,
                                          end_line: 55,
                                          end_column: 49,
                                        },
                                      },
                                    ],
                                  },
                                  id: 151,
                                  span: {
                                    start_line: 55,
                                    start_column: 25,
                                    end_line: 55,
                                    end_column: 50,
                                  },
                                },
                              ],
                            },
                            id: 148,
                            span: {
                              start_line: 55,
                              start_column: 17,
                              end_line: 55,
                              end_column: 51,
                            },
                          },
                        ],
                      },
                      id: 146,
                      span: {
                        start_line: 55,
                        start_column: 5,
                        end_line: 55,
                        end_column: 52,
                      },
                    },
                    {
                      expr: {
                        List: [
                          {
                            expr: {
                              Atom: "to",
                            },
                            id: 156,
                            span: {
                              start_line: 55,
                              start_column: 55,
                              end_line: 55,
                              end_column: 56,
                            },
                          },
                          {
                            expr: {
                              Atom: "principal",
                            },
                            id: 157,
                            span: {
                              start_line: 55,
                              start_column: 58,
                              end_line: 55,
                              end_column: 66,
                            },
                          },
                        ],
                      },
                      id: 155,
                      span: {
                        start_line: 55,
                        start_column: 54,
                        end_line: 55,
                        end_column: 67,
                      },
                    },
                    {
                      expr: {
                        List: [
                          {
                            expr: {
                              Atom: "amount",
                            },
                            id: 159,
                            span: {
                              start_line: 55,
                              start_column: 70,
                              end_line: 55,
                              end_column: 75,
                            },
                          },
                          {
                            expr: {
                              Atom: "uint",
                            },
                            id: 160,
                            span: {
                              start_line: 55,
                              start_column: 77,
                              end_line: 55,
                              end_column: 80,
                            },
                          },
                        ],
                      },
                      id: 158,
                      span: {
                        start_line: 55,
                        start_column: 69,
                        end_line: 55,
                        end_column: 81,
                      },
                    },
                  ],
                },
                id: 144,
                span: {
                  start_line: 54,
                  start_column: 16,
                  end_line: 56,
                  end_column: 3,
                },
              },
              {
                expr: {
                  List: [
                    {
                      expr: {
                        Atom: "ok",
                      },
                      id: 162,
                      span: {
                        start_line: 57,
                        start_column: 4,
                        end_line: 57,
                        end_column: 5,
                      },
                    },
                    {
                      expr: {
                        Atom: "true",
                      },
                      id: 163,
                      span: {
                        start_line: 57,
                        start_column: 7,
                        end_line: 57,
                        end_column: 10,
                      },
                    },
                  ],
                },
                id: 161,
                span: {
                  start_line: 57,
                  start_column: 3,
                  end_line: 57,
                  end_column: 11,
                },
              },
            ],
          },
          id: 142,
          span: {
            start_line: 54,
            start_column: 1,
            end_line: 58,
            end_column: 1,
          },
          pre_comments: [
            [
              "Properties",
              {
                start_line: 51,
                start_column: 1,
                end_line: 51,
                end_column: 13,
              },
            ],
          ],
        },
      ],
      top_level_expression_sorting: [0, 2, 1, 3, 4, 5, 6, 7, 8],
      referenced_traits: {},
      implemented_traits: [],
    },
  },
  listOptionalNestedTrait: {
    functionsInterfaces: [
      {
        name: "transfer",
        access: "private",
        args: [
          {
            name: "one-transfer",
            type: {
              tuple: [
                {
                  name: "amount",
                  type: "uint128",
                },
                {
                  name: "to",
                  type: "principal",
                },
                {
                  name: "token",
                  type: "trait_reference",
                },
              ],
            },
          },
        ],
        outputs: {
          type: {
            response: {
              ok: "bool",
              error: "uint128",
            },
          },
        },
      },
      {
        name: "send-tokens",
        access: "public",
        args: [
          {
            name: "transfers",
            type: {
              list: {
                type: {
                  tuple: [
                    {
                      name: "amount",
                      type: "uint128",
                    },
                    {
                      name: "to",
                      type: "principal",
                    },
                    {
                      name: "token",
                      type: "trait_reference",
                    },
                  ],
                },
                length: 5,
              },
            },
          },
        ],
        outputs: {
          type: {
            response: {
              ok: {
                list: {
                  type: {
                    response: {
                      ok: "bool",
                      error: "uint128",
                    },
                  },
                  length: 5,
                },
              },
              error: "none",
            },
          },
        },
      },
      {
        name: "test-list-response",
        access: "public",
        args: [
          {
            name: "token-list",
            type: {
              list: {
                type: {
                  optional: "trait_reference",
                },
                length: 5,
              },
            },
          },
          {
            name: "to",
            type: "principal",
          },
          {
            name: "amount",
            type: "uint128",
          },
        ],
        outputs: {
          type: {
            response: {
              ok: "bool",
              error: "none",
            },
          },
        },
      },
      {
        name: "update-context",
        access: "public",
        args: [
          {
            name: "function-name",
            type: {
              "string-ascii": {
                length: 100,
              },
            },
          },
          {
            name: "called",
            type: "uint128",
          },
        ],
        outputs: {
          type: {
            response: {
              ok: "bool",
              error: "none",
            },
          },
        },
      },
      {
        name: "invariant-token-supply-vs-balance",
        access: "read_only",
        args: [
          {
            name: "address",
            type: "principal",
          },
        ],
        outputs: {
          type: "bool",
        },
      },
    ],
    ast: {
      contract_identifier: {
        issuer: [
          26,
          [
            109, 120, 222, 123, 6, 37, 223, 191, 193, 108, 58, 138, 87, 53, 246,
            220, 61, 195, 242, 206,
          ],
        ],
        name: "trait-contract",
      },
      pre_expressions: [],
      expressions: [
        {
          expr: {
            List: [
              {
                expr: {
                  Atom: "use-trait",
                },
                id: 2,
                span: {
                  start_line: 1,
                  start_column: 2,
                  end_line: 1,
                  end_column: 10,
                },
              },
              {
                expr: {
                  Atom: "ft-trait",
                },
                id: 3,
                span: {
                  start_line: 1,
                  start_column: 12,
                  end_line: 1,
                  end_column: 19,
                },
              },
              {
                expr: {
                  Field: {
                    name: "sip-010-trait",
                    contract_identifier: {
                      issuer: [
                        22,
                        [
                          9, 159, 184, 137, 38, 216, 47, 48, 178, 244, 14, 175,
                          62, 228, 35, 203, 114, 91, 219, 59,
                        ],
                      ],
                      name: "sip-010-trait-ft-standard",
                    },
                  },
                },
                id: 4,
                span: {
                  start_line: 1,
                  start_column: 21,
                  end_line: 1,
                  end_column: 101,
                },
              },
            ],
          },
          id: 1,
          span: {
            start_line: 1,
            start_column: 1,
            end_line: 1,
            end_column: 102,
          },
        },
        {
          expr: {
            List: [
              {
                expr: {
                  Atom: "define-private",
                },
                id: 6,
                span: {
                  start_line: 9,
                  start_column: 2,
                  end_line: 9,
                  end_column: 15,
                },
              },
              {
                expr: {
                  List: [
                    {
                      expr: {
                        Atom: "transfer",
                      },
                      id: 8,
                      span: {
                        start_line: 9,
                        start_column: 18,
                        end_line: 9,
                        end_column: 25,
                      },
                    },
                    {
                      expr: {
                        List: [
                          {
                            expr: {
                              Atom: "one-transfer",
                            },
                            id: 10,
                            span: {
                              start_line: 10,
                              start_column: 6,
                              end_line: 10,
                              end_column: 17,
                            },
                          },
                          {
                            expr: {
                              List: [
                                {
                                  expr: {
                                    Atom: "tuple",
                                  },
                                  id: 12,
                                  span: {
                                    start_line: 0,
                                    start_column: 0,
                                    end_line: 0,
                                    end_column: 0,
                                  },
                                },
                                {
                                  expr: {
                                    List: [
                                      {
                                        expr: {
                                          Atom: "token",
                                        },
                                        id: 14,
                                        span: {
                                          start_line: 10,
                                          start_column: 20,
                                          end_line: 10,
                                          end_column: 24,
                                        },
                                      },
                                      {
                                        expr: {
                                          TraitReference: [
                                            "ft-trait",
                                            {
                                              Imported: {
                                                name: "sip-010-trait",
                                                contract_identifier: {
                                                  issuer: [
                                                    22,
                                                    [
                                                      9, 159, 184, 137, 38, 216,
                                                      47, 48, 178, 244, 14, 175,
                                                      62, 228, 35, 203, 114, 91,
                                                      219, 59,
                                                    ],
                                                  ],
                                                  name: "sip-010-trait-ft-standard",
                                                },
                                              },
                                            },
                                          ],
                                        },
                                        id: 15,
                                        span: {
                                          start_line: 10,
                                          start_column: 27,
                                          end_line: 10,
                                          end_column: 36,
                                        },
                                      },
                                    ],
                                  },
                                  id: 13,
                                  span: {
                                    start_line: 10,
                                    start_column: 20,
                                    end_line: 10,
                                    end_column: 36,
                                  },
                                },
                                {
                                  expr: {
                                    List: [
                                      {
                                        expr: {
                                          Atom: "to",
                                        },
                                        id: 17,
                                        span: {
                                          start_line: 10,
                                          start_column: 39,
                                          end_line: 10,
                                          end_column: 40,
                                        },
                                      },
                                      {
                                        expr: {
                                          Atom: "principal",
                                        },
                                        id: 18,
                                        span: {
                                          start_line: 10,
                                          start_column: 43,
                                          end_line: 10,
                                          end_column: 51,
                                        },
                                      },
                                    ],
                                  },
                                  id: 16,
                                  span: {
                                    start_line: 10,
                                    start_column: 39,
                                    end_line: 10,
                                    end_column: 51,
                                  },
                                },
                                {
                                  expr: {
                                    List: [
                                      {
                                        expr: {
                                          Atom: "amount",
                                        },
                                        id: 20,
                                        span: {
                                          start_line: 10,
                                          start_column: 54,
                                          end_line: 10,
                                          end_column: 59,
                                        },
                                      },
                                      {
                                        expr: {
                                          Atom: "uint",
                                        },
                                        id: 21,
                                        span: {
                                          start_line: 10,
                                          start_column: 62,
                                          end_line: 10,
                                          end_column: 65,
                                        },
                                      },
                                    ],
                                  },
                                  id: 19,
                                  span: {
                                    start_line: 10,
                                    start_column: 54,
                                    end_line: 10,
                                    end_column: 65,
                                  },
                                },
                              ],
                            },
                            id: 11,
                            span: {
                              start_line: 10,
                              start_column: 19,
                              end_line: 10,
                              end_column: 66,
                            },
                          },
                        ],
                      },
                      id: 9,
                      span: {
                        start_line: 10,
                        start_column: 5,
                        end_line: 10,
                        end_column: 67,
                      },
                    },
                  ],
                },
                id: 7,
                span: {
                  start_line: 9,
                  start_column: 17,
                  end_line: 11,
                  end_column: 3,
                },
              },
              {
                expr: {
                  List: [
                    {
                      expr: {
                        Atom: "let",
                      },
                      id: 23,
                      span: {
                        start_line: 12,
                        start_column: 4,
                        end_line: 12,
                        end_column: 6,
                      },
                    },
                    {
                      expr: {
                        List: [
                          {
                            expr: {
                              List: [
                                {
                                  expr: {
                                    Atom: "ft",
                                  },
                                  id: 26,
                                  span: {
                                    start_line: 14,
                                    start_column: 8,
                                    end_line: 14,
                                    end_column: 9,
                                  },
                                },
                                {
                                  expr: {
                                    List: [
                                      {
                                        expr: {
                                          Atom: "get",
                                        },
                                        id: 28,
                                        span: {
                                          start_line: 14,
                                          start_column: 12,
                                          end_line: 14,
                                          end_column: 14,
                                        },
                                      },
                                      {
                                        expr: {
                                          Atom: "token",
                                        },
                                        id: 29,
                                        span: {
                                          start_line: 14,
                                          start_column: 16,
                                          end_line: 14,
                                          end_column: 20,
                                        },
                                      },
                                      {
                                        expr: {
                                          Atom: "one-transfer",
                                        },
                                        id: 30,
                                        span: {
                                          start_line: 14,
                                          start_column: 22,
                                          end_line: 14,
                                          end_column: 33,
                                        },
                                      },
                                    ],
                                  },
                                  id: 27,
                                  span: {
                                    start_line: 14,
                                    start_column: 11,
                                    end_line: 14,
                                    end_column: 34,
                                  },
                                },
                              ],
                            },
                            id: 25,
                            span: {
                              start_line: 14,
                              start_column: 7,
                              end_line: 14,
                              end_column: 35,
                            },
                          },
                          {
                            expr: {
                              List: [
                                {
                                  expr: {
                                    Atom: "to",
                                  },
                                  id: 32,
                                  span: {
                                    start_line: 15,
                                    start_column: 8,
                                    end_line: 15,
                                    end_column: 9,
                                  },
                                },
                                {
                                  expr: {
                                    List: [
                                      {
                                        expr: {
                                          Atom: "get",
                                        },
                                        id: 34,
                                        span: {
                                          start_line: 15,
                                          start_column: 12,
                                          end_line: 15,
                                          end_column: 14,
                                        },
                                      },
                                      {
                                        expr: {
                                          Atom: "to",
                                        },
                                        id: 35,
                                        span: {
                                          start_line: 15,
                                          start_column: 16,
                                          end_line: 15,
                                          end_column: 17,
                                        },
                                      },
                                      {
                                        expr: {
                                          Atom: "one-transfer",
                                        },
                                        id: 36,
                                        span: {
                                          start_line: 15,
                                          start_column: 19,
                                          end_line: 15,
                                          end_column: 30,
                                        },
                                      },
                                    ],
                                  },
                                  id: 33,
                                  span: {
                                    start_line: 15,
                                    start_column: 11,
                                    end_line: 15,
                                    end_column: 31,
                                  },
                                },
                              ],
                            },
                            id: 31,
                            span: {
                              start_line: 15,
                              start_column: 7,
                              end_line: 15,
                              end_column: 32,
                            },
                          },
                          {
                            expr: {
                              List: [
                                {
                                  expr: {
                                    Atom: "amount",
                                  },
                                  id: 38,
                                  span: {
                                    start_line: 16,
                                    start_column: 8,
                                    end_line: 16,
                                    end_column: 13,
                                  },
                                },
                                {
                                  expr: {
                                    List: [
                                      {
                                        expr: {
                                          Atom: "get",
                                        },
                                        id: 40,
                                        span: {
                                          start_line: 16,
                                          start_column: 16,
                                          end_line: 16,
                                          end_column: 18,
                                        },
                                      },
                                      {
                                        expr: {
                                          Atom: "amount",
                                        },
                                        id: 41,
                                        span: {
                                          start_line: 16,
                                          start_column: 20,
                                          end_line: 16,
                                          end_column: 25,
                                        },
                                      },
                                      {
                                        expr: {
                                          Atom: "one-transfer",
                                        },
                                        id: 42,
                                        span: {
                                          start_line: 16,
                                          start_column: 27,
                                          end_line: 16,
                                          end_column: 38,
                                        },
                                      },
                                    ],
                                  },
                                  id: 39,
                                  span: {
                                    start_line: 16,
                                    start_column: 15,
                                    end_line: 16,
                                    end_column: 39,
                                  },
                                },
                              ],
                            },
                            id: 37,
                            span: {
                              start_line: 16,
                              start_column: 7,
                              end_line: 16,
                              end_column: 40,
                            },
                          },
                        ],
                      },
                      id: 24,
                      span: {
                        start_line: 13,
                        start_column: 5,
                        end_line: 17,
                        end_column: 5,
                      },
                    },
                    {
                      expr: {
                        List: [
                          {
                            expr: {
                              Atom: "contract-call?",
                            },
                            id: 44,
                            span: {
                              start_line: 18,
                              start_column: 6,
                              end_line: 18,
                              end_column: 19,
                            },
                          },
                          {
                            expr: {
                              Atom: "ft",
                            },
                            id: 45,
                            span: {
                              start_line: 18,
                              start_column: 21,
                              end_line: 18,
                              end_column: 22,
                            },
                          },
                          {
                            expr: {
                              Atom: "transfer",
                            },
                            id: 46,
                            span: {
                              start_line: 18,
                              start_column: 24,
                              end_line: 18,
                              end_column: 31,
                            },
                          },
                          {
                            expr: {
                              Atom: "amount",
                            },
                            id: 47,
                            span: {
                              start_line: 18,
                              start_column: 33,
                              end_line: 18,
                              end_column: 38,
                            },
                          },
                          {
                            expr: {
                              Atom: "tx-sender",
                            },
                            id: 48,
                            span: {
                              start_line: 18,
                              start_column: 40,
                              end_line: 18,
                              end_column: 48,
                            },
                          },
                          {
                            expr: {
                              Atom: "to",
                            },
                            id: 49,
                            span: {
                              start_line: 18,
                              start_column: 50,
                              end_line: 18,
                              end_column: 51,
                            },
                          },
                          {
                            expr: {
                              Atom: "none",
                            },
                            id: 50,
                            span: {
                              start_line: 18,
                              start_column: 53,
                              end_line: 18,
                              end_column: 56,
                            },
                          },
                        ],
                      },
                      id: 43,
                      span: {
                        start_line: 18,
                        start_column: 5,
                        end_line: 18,
                        end_column: 57,
                      },
                    },
                  ],
                },
                id: 22,
                span: {
                  start_line: 12,
                  start_column: 3,
                  end_line: 18,
                  end_column: 58,
                },
              },
            ],
          },
          id: 5,
          span: {
            start_line: 9,
            start_column: 1,
            end_line: 19,
            end_column: 1,
          },
        },
        {
          expr: {
            List: [
              {
                expr: {
                  Atom: "define-public",
                },
                id: 52,
                span: {
                  start_line: 3,
                  start_column: 2,
                  end_line: 3,
                  end_column: 14,
                },
              },
              {
                expr: {
                  List: [
                    {
                      expr: {
                        Atom: "send-tokens",
                      },
                      id: 54,
                      span: {
                        start_line: 3,
                        start_column: 17,
                        end_line: 3,
                        end_column: 27,
                      },
                    },
                    {
                      expr: {
                        List: [
                          {
                            expr: {
                              Atom: "transfers",
                            },
                            id: 56,
                            span: {
                              start_line: 4,
                              start_column: 6,
                              end_line: 4,
                              end_column: 14,
                            },
                          },
                          {
                            expr: {
                              List: [
                                {
                                  expr: {
                                    Atom: "list",
                                  },
                                  id: 58,
                                  span: {
                                    start_line: 4,
                                    start_column: 17,
                                    end_line: 4,
                                    end_column: 20,
                                  },
                                },
                                {
                                  expr: {
                                    LiteralValue: {
                                      Int: "5",
                                    },
                                  },
                                  id: 59,
                                  span: {
                                    start_line: 4,
                                    start_column: 22,
                                    end_line: 4,
                                    end_column: 22,
                                  },
                                },
                                {
                                  expr: {
                                    List: [
                                      {
                                        expr: {
                                          Atom: "tuple",
                                        },
                                        id: 61,
                                        span: {
                                          start_line: 0,
                                          start_column: 0,
                                          end_line: 0,
                                          end_column: 0,
                                        },
                                      },
                                      {
                                        expr: {
                                          List: [
                                            {
                                              expr: {
                                                Atom: "token",
                                              },
                                              id: 63,
                                              span: {
                                                start_line: 4,
                                                start_column: 25,
                                                end_line: 4,
                                                end_column: 29,
                                              },
                                            },
                                            {
                                              expr: {
                                                TraitReference: [
                                                  "ft-trait",
                                                  {
                                                    Imported: {
                                                      name: "sip-010-trait",
                                                      contract_identifier: {
                                                        issuer: [
                                                          22,
                                                          [
                                                            9, 159, 184, 137,
                                                            38, 216, 47, 48,
                                                            178, 244, 14, 175,
                                                            62, 228, 35, 203,
                                                            114, 91, 219, 59,
                                                          ],
                                                        ],
                                                        name: "sip-010-trait-ft-standard",
                                                      },
                                                    },
                                                  },
                                                ],
                                              },
                                              id: 64,
                                              span: {
                                                start_line: 4,
                                                start_column: 32,
                                                end_line: 4,
                                                end_column: 41,
                                              },
                                            },
                                          ],
                                        },
                                        id: 62,
                                        span: {
                                          start_line: 4,
                                          start_column: 25,
                                          end_line: 4,
                                          end_column: 41,
                                        },
                                      },
                                      {
                                        expr: {
                                          List: [
                                            {
                                              expr: {
                                                Atom: "to",
                                              },
                                              id: 66,
                                              span: {
                                                start_line: 4,
                                                start_column: 44,
                                                end_line: 4,
                                                end_column: 45,
                                              },
                                            },
                                            {
                                              expr: {
                                                Atom: "principal",
                                              },
                                              id: 67,
                                              span: {
                                                start_line: 4,
                                                start_column: 48,
                                                end_line: 4,
                                                end_column: 56,
                                              },
                                            },
                                          ],
                                        },
                                        id: 65,
                                        span: {
                                          start_line: 4,
                                          start_column: 44,
                                          end_line: 4,
                                          end_column: 56,
                                        },
                                      },
                                      {
                                        expr: {
                                          List: [
                                            {
                                              expr: {
                                                Atom: "amount",
                                              },
                                              id: 69,
                                              span: {
                                                start_line: 4,
                                                start_column: 59,
                                                end_line: 4,
                                                end_column: 64,
                                              },
                                            },
                                            {
                                              expr: {
                                                Atom: "uint",
                                              },
                                              id: 70,
                                              span: {
                                                start_line: 4,
                                                start_column: 67,
                                                end_line: 4,
                                                end_column: 70,
                                              },
                                            },
                                          ],
                                        },
                                        id: 68,
                                        span: {
                                          start_line: 4,
                                          start_column: 59,
                                          end_line: 4,
                                          end_column: 70,
                                        },
                                      },
                                    ],
                                  },
                                  id: 60,
                                  span: {
                                    start_line: 4,
                                    start_column: 24,
                                    end_line: 4,
                                    end_column: 71,
                                  },
                                },
                              ],
                            },
                            id: 57,
                            span: {
                              start_line: 4,
                              start_column: 16,
                              end_line: 4,
                              end_column: 72,
                            },
                          },
                        ],
                      },
                      id: 55,
                      span: {
                        start_line: 4,
                        start_column: 5,
                        end_line: 4,
                        end_column: 73,
                      },
                    },
                  ],
                },
                id: 53,
                span: {
                  start_line: 3,
                  start_column: 16,
                  end_line: 5,
                  end_column: 3,
                },
              },
              {
                expr: {
                  List: [
                    {
                      expr: {
                        Atom: "ok",
                      },
                      id: 72,
                      span: {
                        start_line: 6,
                        start_column: 4,
                        end_line: 6,
                        end_column: 5,
                      },
                    },
                    {
                      expr: {
                        List: [
                          {
                            expr: {
                              Atom: "map",
                            },
                            id: 74,
                            span: {
                              start_line: 6,
                              start_column: 8,
                              end_line: 6,
                              end_column: 10,
                            },
                          },
                          {
                            expr: {
                              Atom: "transfer",
                            },
                            id: 75,
                            span: {
                              start_line: 6,
                              start_column: 12,
                              end_line: 6,
                              end_column: 19,
                            },
                          },
                          {
                            expr: {
                              Atom: "transfers",
                            },
                            id: 76,
                            span: {
                              start_line: 6,
                              start_column: 21,
                              end_line: 6,
                              end_column: 29,
                            },
                          },
                        ],
                      },
                      id: 73,
                      span: {
                        start_line: 6,
                        start_column: 7,
                        end_line: 6,
                        end_column: 30,
                      },
                    },
                  ],
                },
                id: 71,
                span: {
                  start_line: 6,
                  start_column: 3,
                  end_line: 6,
                  end_column: 31,
                },
              },
            ],
          },
          id: 51,
          span: {
            start_line: 3,
            start_column: 1,
            end_line: 7,
            end_column: 1,
          },
        },
        {
          expr: {
            List: [
              {
                expr: {
                  Atom: "define-map",
                },
                id: 78,
                span: {
                  start_line: 22,
                  start_column: 2,
                  end_line: 22,
                  end_column: 11,
                },
              },
              {
                expr: {
                  Atom: "context",
                },
                id: 79,
                span: {
                  start_line: 22,
                  start_column: 13,
                  end_line: 22,
                  end_column: 19,
                },
              },
              {
                expr: {
                  List: [
                    {
                      expr: {
                        Atom: "string-ascii",
                      },
                      id: 81,
                      span: {
                        start_line: 22,
                        start_column: 22,
                        end_line: 22,
                        end_column: 33,
                      },
                    },
                    {
                      expr: {
                        LiteralValue: {
                          Int: "100",
                        },
                      },
                      id: 82,
                      span: {
                        start_line: 22,
                        start_column: 35,
                        end_line: 22,
                        end_column: 37,
                      },
                    },
                  ],
                },
                id: 80,
                span: {
                  start_line: 22,
                  start_column: 21,
                  end_line: 22,
                  end_column: 38,
                },
              },
              {
                expr: {
                  List: [
                    {
                      expr: {
                        Atom: "tuple",
                      },
                      id: 84,
                      span: {
                        start_line: 0,
                        start_column: 0,
                        end_line: 0,
                        end_column: 0,
                      },
                    },
                    {
                      expr: {
                        List: [
                          {
                            expr: {
                              Atom: "called",
                            },
                            id: 86,
                            span: {
                              start_line: 23,
                              start_column: 5,
                              end_line: 23,
                              end_column: 10,
                            },
                          },
                          {
                            expr: {
                              Atom: "uint",
                            },
                            id: 87,
                            span: {
                              start_line: 23,
                              start_column: 13,
                              end_line: 23,
                              end_column: 16,
                            },
                            post_comments: [
                              [
                                "other data",
                                {
                                  start_line: 24,
                                  start_column: 5,
                                  end_line: 24,
                                  end_column: 17,
                                },
                              ],
                            ],
                          },
                        ],
                      },
                      id: 85,
                      span: {
                        start_line: 23,
                        start_column: 5,
                        end_line: 23,
                        end_column: 16,
                      },
                    },
                  ],
                },
                id: 83,
                span: {
                  start_line: 22,
                  start_column: 40,
                  end_line: 25,
                  end_column: 3,
                },
              },
            ],
          },
          id: 77,
          span: {
            start_line: 22,
            start_column: 1,
            end_line: 25,
            end_column: 4,
          },
        },
        {
          expr: {
            List: [
              {
                expr: {
                  Atom: "define-public",
                },
                id: 89,
                span: {
                  start_line: 27,
                  start_column: 4,
                  end_line: 27,
                  end_column: 16,
                },
              },
              {
                expr: {
                  List: [
                    {
                      expr: {
                        Atom: "update-context",
                      },
                      id: 91,
                      span: {
                        start_line: 27,
                        start_column: 19,
                        end_line: 27,
                        end_column: 32,
                      },
                    },
                    {
                      expr: {
                        List: [
                          {
                            expr: {
                              Atom: "function-name",
                            },
                            id: 93,
                            span: {
                              start_line: 27,
                              start_column: 35,
                              end_line: 27,
                              end_column: 47,
                            },
                          },
                          {
                            expr: {
                              List: [
                                {
                                  expr: {
                                    Atom: "string-ascii",
                                  },
                                  id: 95,
                                  span: {
                                    start_line: 27,
                                    start_column: 50,
                                    end_line: 27,
                                    end_column: 61,
                                  },
                                },
                                {
                                  expr: {
                                    LiteralValue: {
                                      Int: "100",
                                    },
                                  },
                                  id: 96,
                                  span: {
                                    start_line: 27,
                                    start_column: 63,
                                    end_line: 27,
                                    end_column: 65,
                                  },
                                },
                              ],
                            },
                            id: 94,
                            span: {
                              start_line: 27,
                              start_column: 49,
                              end_line: 27,
                              end_column: 66,
                            },
                          },
                        ],
                      },
                      id: 92,
                      span: {
                        start_line: 27,
                        start_column: 34,
                        end_line: 27,
                        end_column: 67,
                      },
                    },
                    {
                      expr: {
                        List: [
                          {
                            expr: {
                              Atom: "called",
                            },
                            id: 98,
                            span: {
                              start_line: 27,
                              start_column: 70,
                              end_line: 27,
                              end_column: 75,
                            },
                          },
                          {
                            expr: {
                              Atom: "uint",
                            },
                            id: 99,
                            span: {
                              start_line: 27,
                              start_column: 77,
                              end_line: 27,
                              end_column: 80,
                            },
                          },
                        ],
                      },
                      id: 97,
                      span: {
                        start_line: 27,
                        start_column: 69,
                        end_line: 27,
                        end_column: 81,
                      },
                    },
                  ],
                },
                id: 90,
                span: {
                  start_line: 27,
                  start_column: 18,
                  end_line: 27,
                  end_column: 82,
                },
              },
              {
                expr: {
                  List: [
                    {
                      expr: {
                        Atom: "ok",
                      },
                      id: 101,
                      span: {
                        start_line: 28,
                        start_column: 6,
                        end_line: 28,
                        end_column: 7,
                      },
                    },
                    {
                      expr: {
                        List: [
                          {
                            expr: {
                              Atom: "map-set",
                            },
                            id: 103,
                            span: {
                              start_line: 28,
                              start_column: 10,
                              end_line: 28,
                              end_column: 16,
                            },
                          },
                          {
                            expr: {
                              Atom: "context",
                            },
                            id: 104,
                            span: {
                              start_line: 28,
                              start_column: 18,
                              end_line: 28,
                              end_column: 24,
                            },
                          },
                          {
                            expr: {
                              Atom: "function-name",
                            },
                            id: 105,
                            span: {
                              start_line: 28,
                              start_column: 26,
                              end_line: 28,
                              end_column: 38,
                            },
                          },
                          {
                            expr: {
                              List: [
                                {
                                  expr: {
                                    Atom: "tuple",
                                  },
                                  id: 107,
                                  span: {
                                    start_line: 0,
                                    start_column: 0,
                                    end_line: 0,
                                    end_column: 0,
                                  },
                                },
                                {
                                  expr: {
                                    List: [
                                      {
                                        expr: {
                                          Atom: "called",
                                        },
                                        id: 109,
                                        span: {
                                          start_line: 28,
                                          start_column: 41,
                                          end_line: 28,
                                          end_column: 46,
                                        },
                                      },
                                      {
                                        expr: {
                                          Atom: "called",
                                        },
                                        id: 110,
                                        span: {
                                          start_line: 28,
                                          start_column: 49,
                                          end_line: 28,
                                          end_column: 54,
                                        },
                                      },
                                    ],
                                  },
                                  id: 108,
                                  span: {
                                    start_line: 28,
                                    start_column: 41,
                                    end_line: 28,
                                    end_column: 54,
                                  },
                                },
                              ],
                            },
                            id: 106,
                            span: {
                              start_line: 28,
                              start_column: 40,
                              end_line: 28,
                              end_column: 55,
                            },
                          },
                        ],
                      },
                      id: 102,
                      span: {
                        start_line: 28,
                        start_column: 9,
                        end_line: 28,
                        end_column: 56,
                      },
                    },
                  ],
                },
                id: 100,
                span: {
                  start_line: 28,
                  start_column: 5,
                  end_line: 28,
                  end_column: 57,
                },
              },
            ],
          },
          id: 88,
          span: {
            start_line: 27,
            start_column: 3,
            end_line: 28,
            end_column: 58,
          },
        },
        {
          expr: {
            List: [
              {
                expr: {
                  Atom: "define-read-only",
                },
                id: 112,
                span: {
                  start_line: 32,
                  start_column: 2,
                  end_line: 32,
                  end_column: 17,
                },
              },
              {
                expr: {
                  List: [
                    {
                      expr: {
                        Atom: "invariant-token-supply-vs-balance",
                      },
                      id: 114,
                      span: {
                        start_line: 32,
                        start_column: 20,
                        end_line: 32,
                        end_column: 52,
                      },
                    },
                    {
                      expr: {
                        List: [
                          {
                            expr: {
                              Atom: "address",
                            },
                            id: 116,
                            span: {
                              start_line: 32,
                              start_column: 55,
                              end_line: 32,
                              end_column: 61,
                            },
                          },
                          {
                            expr: {
                              Atom: "principal",
                            },
                            id: 117,
                            span: {
                              start_line: 32,
                              start_column: 63,
                              end_line: 32,
                              end_column: 71,
                            },
                          },
                        ],
                      },
                      id: 115,
                      span: {
                        start_line: 32,
                        start_column: 54,
                        end_line: 32,
                        end_column: 72,
                      },
                    },
                  ],
                },
                id: 113,
                span: {
                  start_line: 32,
                  start_column: 19,
                  end_line: 32,
                  end_column: 73,
                },
              },
              {
                expr: {
                  List: [
                    {
                      expr: {
                        Atom: "let",
                      },
                      id: 119,
                      span: {
                        start_line: 33,
                        start_column: 4,
                        end_line: 33,
                        end_column: 6,
                      },
                    },
                    {
                      expr: {
                        List: [
                          {
                            expr: {
                              List: [
                                {
                                  expr: {
                                    Atom: "total-supply",
                                  },
                                  id: 122,
                                  span: {
                                    start_line: 35,
                                    start_column: 8,
                                    end_line: 35,
                                    end_column: 19,
                                  },
                                },
                                {
                                  expr: {
                                    List: [
                                      {
                                        expr: {
                                          Atom: "unwrap-panic",
                                        },
                                        id: 124,
                                        span: {
                                          start_line: 36,
                                          start_column: 10,
                                          end_line: 36,
                                          end_column: 21,
                                        },
                                      },
                                      {
                                        expr: {
                                          List: [
                                            {
                                              expr: {
                                                Atom: "contract-call?",
                                              },
                                              id: 126,
                                              span: {
                                                start_line: 36,
                                                start_column: 24,
                                                end_line: 36,
                                                end_column: 37,
                                              },
                                            },
                                            {
                                              expr: {
                                                LiteralValue: {
                                                  Principal: {
                                                    Contract: {
                                                      issuer: [
                                                        26,
                                                        [
                                                          109, 120, 222, 123, 6,
                                                          37, 223, 191, 193,
                                                          108, 58, 138, 87, 53,
                                                          246, 220, 61, 195,
                                                          242, 206,
                                                        ],
                                                      ],
                                                      name: "rendezvous-token",
                                                    },
                                                  },
                                                },
                                              },
                                              id: 127,
                                              span: {
                                                start_line: 36,
                                                start_column: 39,
                                                end_line: 36,
                                                end_column: 55,
                                              },
                                            },
                                            {
                                              expr: {
                                                Atom: "get-total-supply",
                                              },
                                              id: 128,
                                              span: {
                                                start_line: 36,
                                                start_column: 57,
                                                end_line: 36,
                                                end_column: 72,
                                              },
                                            },
                                          ],
                                        },
                                        id: 125,
                                        span: {
                                          start_line: 36,
                                          start_column: 23,
                                          end_line: 36,
                                          end_column: 73,
                                        },
                                      },
                                    ],
                                  },
                                  id: 123,
                                  span: {
                                    start_line: 36,
                                    start_column: 9,
                                    end_line: 36,
                                    end_column: 74,
                                  },
                                },
                              ],
                            },
                            id: 121,
                            span: {
                              start_line: 35,
                              start_column: 7,
                              end_line: 36,
                              end_column: 75,
                            },
                          },
                          {
                            expr: {
                              List: [
                                {
                                  expr: {
                                    Atom: "user-balance",
                                  },
                                  id: 130,
                                  span: {
                                    start_line: 37,
                                    start_column: 8,
                                    end_line: 37,
                                    end_column: 19,
                                  },
                                },
                                {
                                  expr: {
                                    List: [
                                      {
                                        expr: {
                                          Atom: "unwrap-panic",
                                        },
                                        id: 132,
                                        span: {
                                          start_line: 38,
                                          start_column: 10,
                                          end_line: 38,
                                          end_column: 21,
                                        },
                                      },
                                      {
                                        expr: {
                                          List: [
                                            {
                                              expr: {
                                                Atom: "contract-call?",
                                              },
                                              id: 134,
                                              span: {
                                                start_line: 39,
                                                start_column: 12,
                                                end_line: 39,
                                                end_column: 25,
                                              },
                                            },
                                            {
                                              expr: {
                                                LiteralValue: {
                                                  Principal: {
                                                    Contract: {
                                                      issuer: [
                                                        26,
                                                        [
                                                          109, 120, 222, 123, 6,
                                                          37, 223, 191, 193,
                                                          108, 58, 138, 87, 53,
                                                          246, 220, 61, 195,
                                                          242, 206,
                                                        ],
                                                      ],
                                                      name: "rendezvous-token",
                                                    },
                                                  },
                                                },
                                              },
                                              id: 135,
                                              span: {
                                                start_line: 40,
                                                start_column: 13,
                                                end_line: 40,
                                                end_column: 29,
                                              },
                                            },
                                            {
                                              expr: {
                                                Atom: "get-balance",
                                              },
                                              id: 136,
                                              span: {
                                                start_line: 41,
                                                start_column: 13,
                                                end_line: 41,
                                                end_column: 23,
                                              },
                                            },
                                            {
                                              expr: {
                                                Atom: "address",
                                              },
                                              id: 137,
                                              span: {
                                                start_line: 42,
                                                start_column: 13,
                                                end_line: 42,
                                                end_column: 19,
                                              },
                                            },
                                          ],
                                        },
                                        id: 133,
                                        span: {
                                          start_line: 39,
                                          start_column: 11,
                                          end_line: 43,
                                          end_column: 11,
                                        },
                                      },
                                    ],
                                  },
                                  id: 131,
                                  span: {
                                    start_line: 38,
                                    start_column: 9,
                                    end_line: 44,
                                    end_column: 9,
                                  },
                                },
                              ],
                            },
                            id: 129,
                            span: {
                              start_line: 37,
                              start_column: 7,
                              end_line: 45,
                              end_column: 7,
                            },
                          },
                        ],
                      },
                      id: 120,
                      span: {
                        start_line: 34,
                        start_column: 5,
                        end_line: 46,
                        end_column: 5,
                      },
                    },
                    {
                      expr: {
                        List: [
                          {
                            expr: {
                              Atom: "<=",
                            },
                            id: 139,
                            span: {
                              start_line: 47,
                              start_column: 6,
                              end_line: 47,
                              end_column: 7,
                            },
                          },
                          {
                            expr: {
                              Atom: "user-balance",
                            },
                            id: 140,
                            span: {
                              start_line: 47,
                              start_column: 9,
                              end_line: 47,
                              end_column: 20,
                            },
                          },
                          {
                            expr: {
                              Atom: "total-supply",
                            },
                            id: 141,
                            span: {
                              start_line: 47,
                              start_column: 22,
                              end_line: 47,
                              end_column: 33,
                            },
                          },
                        ],
                      },
                      id: 138,
                      span: {
                        start_line: 47,
                        start_column: 5,
                        end_line: 47,
                        end_column: 34,
                      },
                    },
                  ],
                },
                id: 118,
                span: {
                  start_line: 33,
                  start_column: 3,
                  end_line: 48,
                  end_column: 3,
                },
              },
            ],
          },
          id: 111,
          span: {
            start_line: 32,
            start_column: 1,
            end_line: 49,
            end_column: 1,
          },
          pre_comments: [
            [
              "Invariants",
              {
                start_line: 30,
                start_column: 1,
                end_line: 30,
                end_column: 13,
              },
            ],
          ],
        },
        {
          expr: {
            List: [
              {
                expr: {
                  Atom: "define-public",
                },
                id: 143,
                span: {
                  start_line: 54,
                  start_column: 2,
                  end_line: 54,
                  end_column: 14,
                },
              },
              {
                expr: {
                  List: [
                    {
                      expr: {
                        Atom: "test-list-response",
                      },
                      id: 145,
                      span: {
                        start_line: 54,
                        start_column: 17,
                        end_line: 54,
                        end_column: 34,
                      },
                    },
                    {
                      expr: {
                        List: [
                          {
                            expr: {
                              Atom: "token-list",
                            },
                            id: 147,
                            span: {
                              start_line: 55,
                              start_column: 6,
                              end_line: 55,
                              end_column: 15,
                            },
                          },
                          {
                            expr: {
                              List: [
                                {
                                  expr: {
                                    Atom: "list",
                                  },
                                  id: 149,
                                  span: {
                                    start_line: 55,
                                    start_column: 18,
                                    end_line: 55,
                                    end_column: 21,
                                  },
                                },
                                {
                                  expr: {
                                    LiteralValue: {
                                      Int: "5",
                                    },
                                  },
                                  id: 150,
                                  span: {
                                    start_line: 55,
                                    start_column: 23,
                                    end_line: 55,
                                    end_column: 23,
                                  },
                                },
                                {
                                  expr: {
                                    List: [
                                      {
                                        expr: {
                                          Atom: "optional",
                                        },
                                        id: 152,
                                        span: {
                                          start_line: 55,
                                          start_column: 26,
                                          end_line: 55,
                                          end_column: 33,
                                        },
                                      },
                                      {
                                        expr: {
                                          TraitReference: [
                                            "ft-trait",
                                            {
                                              Imported: {
                                                name: "sip-010-trait",
                                                contract_identifier: {
                                                  issuer: [
                                                    22,
                                                    [
                                                      9, 159, 184, 137, 38, 216,
                                                      47, 48, 178, 244, 14, 175,
                                                      62, 228, 35, 203, 114, 91,
                                                      219, 59,
                                                    ],
                                                  ],
                                                  name: "sip-010-trait-ft-standard",
                                                },
                                              },
                                            },
                                          ],
                                        },
                                        id: 153,
                                        span: {
                                          start_line: 55,
                                          start_column: 35,
                                          end_line: 55,
                                          end_column: 44,
                                        },
                                      },
                                    ],
                                  },
                                  id: 151,
                                  span: {
                                    start_line: 55,
                                    start_column: 25,
                                    end_line: 55,
                                    end_column: 45,
                                  },
                                },
                              ],
                            },
                            id: 148,
                            span: {
                              start_line: 55,
                              start_column: 17,
                              end_line: 55,
                              end_column: 46,
                            },
                          },
                        ],
                      },
                      id: 146,
                      span: {
                        start_line: 55,
                        start_column: 5,
                        end_line: 55,
                        end_column: 47,
                      },
                    },
                    {
                      expr: {
                        List: [
                          {
                            expr: {
                              Atom: "to",
                            },
                            id: 155,
                            span: {
                              start_line: 55,
                              start_column: 50,
                              end_line: 55,
                              end_column: 51,
                            },
                          },
                          {
                            expr: {
                              Atom: "principal",
                            },
                            id: 156,
                            span: {
                              start_line: 55,
                              start_column: 53,
                              end_line: 55,
                              end_column: 61,
                            },
                          },
                        ],
                      },
                      id: 154,
                      span: {
                        start_line: 55,
                        start_column: 49,
                        end_line: 55,
                        end_column: 62,
                      },
                    },
                    {
                      expr: {
                        List: [
                          {
                            expr: {
                              Atom: "amount",
                            },
                            id: 158,
                            span: {
                              start_line: 55,
                              start_column: 65,
                              end_line: 55,
                              end_column: 70,
                            },
                          },
                          {
                            expr: {
                              Atom: "uint",
                            },
                            id: 159,
                            span: {
                              start_line: 55,
                              start_column: 72,
                              end_line: 55,
                              end_column: 75,
                            },
                          },
                        ],
                      },
                      id: 157,
                      span: {
                        start_line: 55,
                        start_column: 64,
                        end_line: 55,
                        end_column: 76,
                      },
                    },
                  ],
                },
                id: 144,
                span: {
                  start_line: 54,
                  start_column: 16,
                  end_line: 56,
                  end_column: 3,
                },
              },
              {
                expr: {
                  List: [
                    {
                      expr: {
                        Atom: "ok",
                      },
                      id: 161,
                      span: {
                        start_line: 57,
                        start_column: 4,
                        end_line: 57,
                        end_column: 5,
                      },
                    },
                    {
                      expr: {
                        Atom: "true",
                      },
                      id: 162,
                      span: {
                        start_line: 57,
                        start_column: 7,
                        end_line: 57,
                        end_column: 10,
                      },
                    },
                  ],
                },
                id: 160,
                span: {
                  start_line: 57,
                  start_column: 3,
                  end_line: 57,
                  end_column: 11,
                },
              },
            ],
          },
          id: 142,
          span: {
            start_line: 54,
            start_column: 1,
            end_line: 58,
            end_column: 1,
          },
          pre_comments: [
            [
              "Properties",
              {
                start_line: 51,
                start_column: 1,
                end_line: 51,
                end_column: 13,
              },
            ],
          ],
        },
      ],
      top_level_expression_sorting: [0, 2, 1, 3, 4, 5, 6, 7, 8],
      referenced_traits: {},
      implemented_traits: [],
    },
  },
};
