import { FIELD_TYPES } from '@cms/sdk';
import type {
  ContentTypeInput,
  FieldDefinitionInput,
  FieldType,
} from '@cms/sdk';
import { failFrom, text } from '#lib/server/errors.js';
import { adminFor, requireCapability } from '#lib/server/session.js';
import type { Actions, PageServerLoad } from './$types';

const readType = (form: FormData): ContentTypeInput => ({
  key: text(form, 'key'),
  name: text(form, 'name'),
  pluralName: text(form, 'pluralName'),
  description: text(form, 'description'),
  archive: form.has('archive'),
  searchable: form.has('searchable'),
  supports: {
    categories: form.has('supports.categories'),
    tags: form.has('supports.tags'),
    comments: form.has('supports.comments'),
    featuredImage: form.has('supports.featuredImage'),
  },
});

const readField = (form: FormData): FieldDefinitionInput => {
  const type = text(form, 'type');
  return {
    key: text(form, 'key'),
    label: text(form, 'label'),
    type: (FIELD_TYPES as readonly string[]).includes(type)
      ? (type as FieldType)
      : 'text',
    options: text(form, 'options')
      .split('\n')
      .map((option) => option.trim())
      .filter(Boolean),
    required: form.has('required'),
    public: form.has('public'),
    help: text(form, 'help'),
    contentTypes: form
      .getAll('contentTypes')
      .filter((value): value is string => typeof value === 'string'),
  };
};

export const load: PageServerLoad = async (event) => {
  requireCapability(event.locals, 'fields.manage');
  return {
    ...(await adminFor(event).contentModel.model()),
    taxonomies: await adminFor(event).taxonomyTypes.list(),
  };
};

export const actions: Actions = {
  saveTaxonomy: async (event) => {
    const form = await event.request.formData();
    try {
      await adminFor(event).taxonomyTypes.save({
        key: text(form, 'key'),
        name: text(form, 'name'),
        hierarchical: form.has('hierarchical'),
      });
    } catch (caught) {
      return failFrom(caught);
    }
    return { notice: 'saved' };
  },
  saveType: async (event) => {
    const form = await event.request.formData();
    const original = text(form, 'original');
    const model = adminFor(event).contentModel;
    try {
      if (original) await model.types.update(original, readType(form));
      else await model.types.create(readType(form));
    } catch (caught) {
      return failFrom(caught);
    }
    return { notice: 'saved' };
  },
  deleteType: async (event) => {
    const form = await event.request.formData();
    try {
      await adminFor(event).contentModel.types.remove(text(form, 'key'));
    } catch (caught) {
      return failFrom(caught);
    }
    return { notice: 'deleted' };
  },
  saveField: async (event) => {
    const form = await event.request.formData();
    const original = text(form, 'original');
    const model = adminFor(event).contentModel;
    try {
      if (original) await model.fields.update(original, readField(form));
      else await model.fields.create(readField(form));
    } catch (caught) {
      return failFrom(caught);
    }
    return { notice: 'saved' };
  },
  deleteField: async (event) => {
    const form = await event.request.formData();
    try {
      await adminFor(event).contentModel.fields.remove(text(form, 'key'));
    } catch (caught) {
      return failFrom(caught);
    }
    return { notice: 'deleted' };
  },
};
