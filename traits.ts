import type { Simnet } from "@stacks/clarinet-sdk";
import type {
  Atom,
  ContractInterfaceFunction,
  IContractAST,
  List,
  TraitReference,
} from "@stacks/clarinet-sdk-wasm";

import type {
  EnrichedContractInterfaceFunction,
  ParameterType,
} from "./shared.types";
import type {
  DefinedTraitType,
  ImplementedTraitType,
  ImportedTraitType,
} from "./traits.types";

/**
 * Enriches a contract interface with trait reference data. Before enrichment,
 * the contract interface lacks trait reference data for parameters. This
 * function constructs a copy of the contract interface with trait reference
 * data for parameters that are trait references.
 * @param ast The contract AST.
 * @param traitReferenceMap The function names mapped to their trait reference
 * parameter paths.
 * @param functionInterfaceList The list of function interfaces for a contract.
 * @param targetContractId The contract ID to enrich with trait reference data.
 * @returns The contract IDs mapped to a list of enriched function interfaces.
 */
export const enrichInterfaceWithTraitData = (
  ast: IContractAST,
  traitReferenceMap: Map<string, any>,
  functionInterfaceList: ContractInterfaceFunction[],
  targetContractId: string,
): Map<string, EnrichedContractInterfaceFunction[]> => {
  const enriched = new Map<string, EnrichedContractInterfaceFunction[]>();

  const enrichArgs = (
    args: any[],
    functionName: string,
    traitRefMapNode: any,
    path: string[] = [],
  ): any[] =>
    args.map((arg) => {
      const listNested = !arg.name;
      const currentPath = listNested ? path : [...path, arg.name];
      // Exit early if the traitReferenceMap does not have anything we are
      // looking for. It means that the current parameter does not have an
      // associated trait reference.
      if (
        !traitRefMapNode ||
        (!traitRefMapNode[arg.name] &&
          !traitRefMapNode.tuple &&
          !traitRefMapNode.list &&
          !traitRefMapNode.response &&
          !traitRefMapNode.optional &&
          !traitRefMapNode[arg.name]?.tuple &&
          !traitRefMapNode[arg.name]?.list &&
          !traitRefMapNode[arg.name]?.response &&
          !traitRefMapNode[arg.name]?.optional &&
          traitRefMapNode !== "trait_reference")
      ) {
        return arg;
      }
      if (arg.type && arg.type.tuple) {
        return {
          ...arg,
          type: {
            tuple: enrichArgs(
              arg.type.tuple,
              functionName,
              listNested
                ? traitRefMapNode.tuple
                : traitRefMapNode[arg.name]?.tuple,
              currentPath,
            ),
          },
        };
      } else if (arg.type && arg.type.list) {
        return {
          ...arg,
          type: {
            list: enrichArgs(
              [arg.type.list],
              functionName,
              listNested
                ? traitRefMapNode.list
                : traitRefMapNode[arg.name]?.list,
              arg.type.list.type.tuple
                ? [...currentPath, "tuple"]
                : arg.type.list.type.response
                  ? [...currentPath, "response"]
                  : arg.type.list.type.optional
                    ? [...currentPath, "optional"]
                    : [...currentPath, "list"],
            )[0],
          },
        };
      } else if (arg.type && arg.type.response) {
        const okPath = listNested ? currentPath : [...currentPath, "ok"];
        const errorPath = listNested ? currentPath : [...currentPath, "error"];

        const okTraitReference = enrichArgs(
          [{ name: "ok", type: arg.type.response.ok }],
          functionName,
          {
            ok: listNested
              ? traitRefMapNode.response?.ok
              : traitRefMapNode[arg.name]?.response?.ok,
          },
          okPath,
        )[0];
        const errorTraitReference = enrichArgs(
          [{ name: "error", type: arg.type.response.error }],
          functionName,
          {
            error: listNested
              ? traitRefMapNode.response?.error
              : traitRefMapNode[arg.name]?.response?.error,
          },
          errorPath,
        )[0];
        return {
          ...arg,
          type: {
            response: {
              ok: okTraitReference.type,
              error: errorTraitReference.type,
            },
          },
        };
      } else if (arg.type && arg.type.optional) {
        const optionalPath = [...currentPath, "optional"];
        const optionalTraitReference = enrichArgs(
          [{ name: "optional", type: arg.type.optional }],
          functionName,
          {
            optional: listNested
              ? traitRefMapNode.optional
              : traitRefMapNode[arg.name]?.optional,
          },
          optionalPath,
        )[0];
        return {
          ...arg,
          type: {
            optional: optionalTraitReference.type,
          },
        };
      } else if (traitRefMapNode && traitRefMapNode[arg.name]) {
        const [traitReferenceName, traitReferenceImport] =
          getTraitReferenceData(
            ast,
            functionName,
            currentPath.filter((x) => x !== undefined),
          );
        if (traitReferenceName && traitReferenceImport) {
          return {
            ...arg,
            type: {
              trait_reference: {
                name: traitReferenceName,
                import: traitReferenceImport,
              },
            },
          };
        }
      } else if (traitRefMapNode === "trait_reference") {
        const [traitReferenceName, traitReferenceImport] =
          getTraitReferenceData(ast, functionName, path);
        if (traitReferenceName && traitReferenceImport) {
          return {
            ...arg,
            type: {
              trait_reference: {
                name: traitReferenceName,
                import: traitReferenceImport,
              },
            },
          };
        }
      }

      return arg;
    });

  const enrichedFunctions = functionInterfaceList.map((f) => ({
    ...f,
    args: enrichArgs(f.args, f.name, traitReferenceMap.get(f.name)),
  }));

  enriched.set(targetContractId, enrichedFunctions);
  return enriched;
};

/**
 * Searches for a trait reference in the contract AST, given the function name
 * and the nesting path of the trait reference.
 * @param ast The contract AST.
 * @param functionName The name of the function to search for trait references
 * import data.
 * @param parameterPath The path to search for the trait reference. The path is
 * an array of strings that represent the nested location of the trait
 * reference in the contract AST.
 * @returns A tuple containing the `trait reference name` and the `imported
 * trait data` if the trait reference is found. Otherwise, returns a tuple of
 * `undefined` values.
 */
const getTraitReferenceData = (
  ast: IContractAST,
  functionName: string,
  parameterPath: string[],
): [string, ImportedTraitType] | [undefined, undefined] => {
  /**
   * Recursively searches for a trait reference import details in the contract
   * parameter nodes, part of the contract AST.
   * @param functionParameterNodes The list of function parameter nodes from
   * the AST. This is the list of nodes following the function name node.
   * @param path The path to search for the trait reference. The path is an
   * array of strings that represent the nested location of the trait reference
   * in the function parameter nodes.
   * @returns A tuple containing the `trait reference name` and the `imported
   * trait data` if the trait reference is found. Otherwise, returns a tuple of
   * `undefined` values.
   */
  const findTraitReference = (
    functionParameterNodes: any[],
    path: string[],
  ): [string, ImportedTraitType] | [undefined, undefined] => {
    for (const parameterNode of functionParameterNodes) {
      // Check if the current parameter node is a trait reference in the first
      // level of the function parameter nodes.
      if (
        parameterNode.expr &&
        (parameterNode.expr as TraitReference).TraitReference
      ) {
        const [name, importData] = (parameterNode.expr as TraitReference)
          .TraitReference;
        return [name, importData];
      }

      if (!parameterNode.expr || !(parameterNode.expr as List).List) {
        continue;
      }

      // The parameter name node is the first node in the parameter node list.
      const parameterNameNode = (parameterNode.expr as List).List[0];

      if (!parameterNameNode || !(parameterNameNode.expr as Atom).Atom) {
        continue;
      }

      const currentParameterName = (
        parameterNameNode.expr as Atom
      ).Atom.toString();

      // Check the first item in the path list to see if it matches the current
      // parameter name. If it does, we are on the right track.
      if (currentParameterName === path[0]) {
        // If the path only has one item left, the trait reference should be
        // right under our noses, in the next node.
        if (path.length === 1) {
          const traitReferenceNode = (parameterNode.expr as List).List[1];
          if (
            traitReferenceNode &&
            (traitReferenceNode.expr as TraitReference).TraitReference
          ) {
            const [name, importData] = (
              traitReferenceNode.expr as TraitReference
            ).TraitReference;
            return [name, importData];
          }
        } else {
          // If the path has more than one item left, we need to traverse down
          // the expression list to find the nested trait reference.
          if (
            (parameterNode.expr as List).List[1] &&
            ((parameterNode.expr as List).List[1].expr as List)
          ) {
            const nestedParameterList = (parameterNode.expr as List).List[1]
              .expr as List | TraitReference;

            if ((nestedParameterList as TraitReference).TraitReference) {
              const [name, importData] = (nestedParameterList as TraitReference)
                .TraitReference;
              return [name, importData];
            } else {
              // Recursively search for the trait reference in the nested
              // parameter list.
              const result = findTraitReference(
                (nestedParameterList as List).List,
                path.slice(1),
              );

              if (result[0] !== undefined) {
                return result;
              }
            }
          }
        }
      }
    }
    return [undefined, undefined];
  };

  for (const node of ast.expressions) {
    if (!node.expr || !(node.expr as List).List) {
      continue;
    }

    // Traverse down the expression.
    const expressionList = (node.expr as List).List;

    // Extract the first atom in the expression list to determine if it is a
    // function definition.
    const potentialFunctionDefinitionAtom = expressionList[0];

    // Check if the potential function definition atom is an actual function
    // definition.
    if (
      !potentialFunctionDefinitionAtom ||
      !["define-public", "define-read-only", "define-private"].includes(
        (potentialFunctionDefinitionAtom.expr as Atom).Atom.toString(),
      )
    ) {
      continue;
    }

    // The current expression is a function definition. Extract the function
    // name node, which is the second node in the expression list.
    const functionNameNode = expressionList[1];

    // Check if the function name node exists and if it is a list.
    if (!functionNameNode || !(functionNameNode.expr as List).List) {
      continue;
    }

    // Extract the function definition list.
    const functionDefinitionList = (functionNameNode.expr as List).List;

    const functionNameAtom = functionDefinitionList[0];

    // Check if the function name atom exists.
    if (!functionNameAtom || !(functionNameAtom.expr as Atom).Atom) {
      continue;
    }

    const currentFunctionName = (functionNameAtom.expr as Atom).Atom.toString();

    // Check if the current function name matches the function name we are
    // looking for.
    if (currentFunctionName !== functionName) {
      continue;
    }

    // Bingo! Found the function definition. The function parameters are the
    // nodes following the function name node.
    const functionParameterNodes = functionDefinitionList.slice(1);

    const traitReferenceImportData = findTraitReference(
      functionParameterNodes,
      parameterPath,
    );

    if (traitReferenceImportData[0] !== undefined) {
      return traitReferenceImportData;
    }
  }
  return [undefined, undefined];
};

/**
 * Builds a map of function names to trait reference paths. The trait reference
 * path is the nesting path of the trait reference in the function parameter
 * list.
 * @param functionInterfaces The list of function interfaces for a contract.
 * @returns The function names mapped to their trait reference parameter paths.
 */
export const buildTraitReferenceMap = (
  functionInterfaces: ContractInterfaceFunction[],
): Map<string, any> => {
  const traitReferenceMap = new Map<string, any>();

  const findTraitReferences = (args: any[]): any => {
    const traitReferences: any = {};
    args.forEach((arg) => {
      if (arg.type && arg.type.tuple) {
        const nestedTraitReferences = findTraitReferences(arg.type.tuple);
        if (Object.keys(nestedTraitReferences).length > 0) {
          traitReferences[arg.name] = { tuple: nestedTraitReferences };
        }
      } else if (arg.type && arg.type.list) {
        const nestedTraitReferences = findTraitReferences([arg.type.list]);
        if (Object.keys(nestedTraitReferences).length > 0) {
          traitReferences[arg.name] = {
            list: nestedTraitReferences["undefined"],
          };
        }
      } else if (arg.type && arg.type.response) {
        const okTraitReferences = findTraitReferences([arg.type.response.ok]);
        const errorTraitReferences = findTraitReferences([
          arg.type.response.error,
        ]);
        const responseTraitReferences: any = {};
        if (Object.keys(okTraitReferences).length > 0) {
          responseTraitReferences.ok =
            okTraitReferences[arg.name] || "trait_reference";
        }
        if (Object.keys(errorTraitReferences).length > 0) {
          responseTraitReferences.error =
            errorTraitReferences[arg.name] || "trait_reference";
        }
        if (Object.keys(responseTraitReferences).length > 0) {
          traitReferences[arg.name] = { response: responseTraitReferences };
        }
      } else if (arg.type && arg.type.optional) {
        const nestedTraitReferences = findTraitReferences([arg.type.optional]);
        if (Object.keys(nestedTraitReferences).length > 0) {
          traitReferences[arg.name] = {
            optional: nestedTraitReferences[arg.name] || "trait_reference",
          };
        }
      } else if (arg.type === "trait_reference") {
        traitReferences[arg.name] = "trait_reference";
      } else if (arg === "trait_reference") {
        traitReferences[arg.name] = "trait_reference";
      }
    });
    return traitReferences;
  };

  functionInterfaces.forEach((fn) => {
    const traitReferences = findTraitReferences(fn.args);
    if (Object.keys(traitReferences).length > 0) {
      traitReferenceMap.set(fn.name, traitReferences);
    }
  });

  return traitReferenceMap;
};

/**
 * Retrieves the contract IDs that implement a given trait.
 * @param trait The trait to search for.
 * @param projectTraitImplementations The record of the project contract IDs to
 * their implemented traits.
 * @returns An array of contract IDs that implement the trait.
 */
export const getContractIdsImplementingTrait = (
  trait: ImportedTraitType | DefinedTraitType,
  projectTraitImplementations: Record<string, ImplementedTraitType[]>,
): string[] => {
  const contracts = Object.keys(projectTraitImplementations);

  const filteredContracts = contracts.filter((contractId) => {
    const traitImplemented = projectTraitImplementations[contractId]?.some(
      (implementedTrait) => {
        const isTraitNamesMatch =
          implementedTrait.name ===
            (trait as ImportedTraitType).import.Imported?.name ||
          implementedTrait.name ===
            (trait as DefinedTraitType).import.Defined?.name;

        const isTraitIssuersMatch =
          JSON.stringify(implementedTrait.contract_identifier.issuer) ===
            JSON.stringify(
              (trait as ImportedTraitType).import.Imported?.contract_identifier
                .issuer,
            ) ||
          JSON.stringify(implementedTrait.contract_identifier.issuer) ===
            JSON.stringify(
              (trait as DefinedTraitType).import.Defined?.contract_identifier
                .issuer,
            );

        return isTraitNamesMatch && isTraitIssuersMatch;
      },
    );
    return traitImplemented;
  });

  return filteredContracts;
};

/**
 * Checks if any parameter of the function contains a `trait_reference` type.
 * @param fn The function interface.
 * @returns Boolean - true if the function contains a trait reference, false
 * otherwise.
 */
export const isTraitReferenceFunction = (
  fn: ContractInterfaceFunction,
): boolean => {
  const hasTraitReference = (type: ParameterType): boolean => {
    if (typeof type === "string") {
      // The type is a base type.
      return type === "trait_reference";
    } else {
      // The type is a complex type.
      if ("buffer" in type) {
        return false;
      }
      if ("string-ascii" in type) {
        return false;
      }
      if ("string-utf8" in type) {
        return false;
      }
      if ("list" in type) {
        return hasTraitReference(type.list.type as ParameterType);
      }
      if ("tuple" in type) {
        return type.tuple.some((item) =>
          hasTraitReference(item.type as ParameterType),
        );
      }
      if ("optional" in type) {
        return hasTraitReference(type.optional as ParameterType);
      }
      if ("response" in type) {
        return (
          hasTraitReference(type.response.ok as ParameterType) ||
          hasTraitReference(type.response.error as ParameterType)
        );
      }
      // Default to false for unexpected types.
      return false;
    }
  };

  return fn.args.some((arg) => hasTraitReference(arg.type as ParameterType));
};

/**
 * Iterates over all project contracts's ASTs excluding the boot ones and
 * extracts a record of contract IDs to their implemented traits.
 * @param simnet The Simnet instance.
 * @returns The contract IDs mapped to their implemented traits.
 */
export const extractProjectTraitImplementations = (simnet: Simnet) => {
  const allProjectContracts = [
    ...simnet.getContractsInterfaces().keys(),
  ].filter((contractId) => {
    const contractDeployer = contractId.split(".")[0];
    return ![
      "SP000000000000000000002Q6VF78",
      "ST000000000000000000002AMW42H",
    ].includes(contractDeployer);
  });

  const projectTraitImplementations = allProjectContracts.reduce<
    Record<string, ImplementedTraitType[]>
  >((acc, contractId) => {
    const ast = simnet.getContractAST(contractId);
    const implementedTraits = ast.implemented_traits as ImplementedTraitType[];
    if (implementedTraits.length > 0) {
      acc[contractId] = implementedTraits;
    }
    return acc;
  }, {});

  return projectTraitImplementations;
};

/**
 * Filters functions that reference traits without eligible implementations in
 * the project. Recursively checks nested parameters for trait reference types.
 * @param enrichedFunctionsInterfaces The map of contract IDs to enriched
 * function interfaces with trait reference data.
 * @param traitReferenceMap The map of function names to their trait reference
 * parameter data.
 * @param projectTraitImplementations The record of contract IDs to their
 * implemented traits.
 * @param contractId The contract ID to filter functions for.
 * @returns An array of function names with trait references without eligible
 * trait implementations.
 */
export const getNonTestableTraitFunctions = (
  enrichedFunctionsInterfaces: Map<string, EnrichedContractInterfaceFunction[]>,
  traitReferenceMap: Map<string, any>,
  projectTraitImplementations: Record<string, ImplementedTraitType[]>,
  contractId: string,
): string[] => {
  const hasTraitReferenceWithoutImplementation = (type: any): boolean => {
    if (!type) {
      return false;
    }

    if (typeof type === "object" && "trait_reference" in type) {
      const contractIdsImplementingTrait = getContractIdsImplementingTrait(
        type.trait_reference as ImportedTraitType | DefinedTraitType,
        projectTraitImplementations,
      );
      return contractIdsImplementingTrait.length === 0;
    }

    if (typeof type === "object") {
      return (
        ("list" in type &&
          hasTraitReferenceWithoutImplementation(type.list.type)) ||
        ("tuple" in type &&
          type.tuple.some((item: any) =>
            hasTraitReferenceWithoutImplementation(item.type),
          )) ||
        ("optional" in type &&
          hasTraitReferenceWithoutImplementation(type.optional)) ||
        ("response" in type &&
          (hasTraitReferenceWithoutImplementation(type.response.ok) ||
            hasTraitReferenceWithoutImplementation(type.response.error)))
      );
    }

    return false;
  };

  return [...traitReferenceMap.keys()].filter((functionName) => {
    const enrichedFunctionInterface = enrichedFunctionsInterfaces
      .get(contractId)
      ?.find((f) => f.name === functionName);

    return (
      enrichedFunctionInterface?.args.some((param) =>
        hasTraitReferenceWithoutImplementation(param.type),
      ) ?? false
    );
  });
};
