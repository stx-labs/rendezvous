/**
 * The trait reference structure, as it appears in the AST under the
 * `implemented_traits` field.
 */
export interface ImplementedTraitType {
  name: string;
  contract_identifier: { issuer: number[]; name: string };
}

/**
 * The imported trait reference structure, as it appears in the AST under a
 * `TraitReference` node. Used to represent the `trait_reference` data for an
 * imported trait `(use-trait <contract_id>.<trait_name>)`.
 */
export interface ImportedTraitType {
  name: string;
  import: {
    Imported: TraitData;
  };
}

/**
 * The defined trait reference structure, as it appears in the AST under a
 * `TraitReference` node. Used to represent the `trait_reference` data for a
 * defined trait `(define-trait <trait_name> (<trait_definition>))`.
 */
export interface DefinedTraitType {
  name: string;
  import: {
    Defined: TraitData;
  };
}

interface TraitData {
  name: string;
  contract_identifier: { issuer: any[]; name: string };
}
