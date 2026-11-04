import type { AdminTaxonomyTerm, TermQuery } from '#sdk/taxonomy';

/** Term list arguments and term policies. */
export interface TaxonomyFilterHooks {
  /** Admin and public term list arguments (WordPress `get_terms_args`); results are revalidated. */
  'term.query': TermQuery;
  /**
   * Whether an authorized term deletion goes ahead (WordPress `pre_delete_term`). Core supplies
   * the initial decision; every handler may return either boolean.
   */
  'term.deleteAllowed': boolean;
}

export interface TaxonomyFilterArgs {
  'term.query': [context: Readonly<{ scope: 'admin' | 'public' }>];
  'term.deleteAllowed': [context: Readonly<{ term: AdminTaxonomyTerm }>];
}
