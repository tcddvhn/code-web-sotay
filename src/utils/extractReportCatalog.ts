import { ExtractCriterionOption, FormTemplate } from '../types';
import { resolveTemplateRowLabels } from './templateWorkbook';

export interface TemplateCriterionCatalog {
  vertical: ExtractCriterionOption[];
  horizontal: ExtractCriterionOption[];
}

function getBlockIdForRow(template: FormTemplate, sourceRow: number) {
  const blocks = template.columnMapping.blocks || [];
  const block = blocks.find((item) => sourceRow >= item.startRow && sourceRow <= item.endRow);
  return block?.id || null;
}

function buildHorizontalCriteria(template: FormTemplate) {
  const blocks = template.columnMapping.blocks || [];
  if (blocks.length > 0) {
    return blocks.flatMap((block) =>
      block.dataColumns.map((column, index) => ({
        key: `${block.id}:${index}`,
        label: `${block.name} / ${block.columnHeaders?.[index] || template.columnHeaders[index] || column}`,
        axis: 'HORIZONTAL' as const,
        templateId: template.id,
        templateName: template.name,
        valueIndex: index,
        blockId: block.id,
      })),
    );
  }

  return template.columnMapping.dataColumns.map((column, index) => ({
    key: `main:${index}`,
    label: template.columnHeaders[index] || column,
    axis: 'HORIZONTAL' as const,
    templateId: template.id,
    templateName: template.name,
    valueIndex: index,
    blockId: null,
  }));
}

export async function buildTemplateCriterionCatalog(
  template: FormTemplate,
): Promise<TemplateCriterionCatalog> {
  const rowLabels = await resolveTemplateRowLabels(template);
  const vertical = rowLabels.map((row) => ({
    key: `${getBlockIdForRow(template, row.sourceRow) || 'main'}:${row.sourceRow}`,
    label: row.label || `Dòng ${row.sourceRow}`,
    axis: 'VERTICAL' as const,
    templateId: template.id,
    templateName: template.name,
    sourceRow: row.sourceRow,
    blockId: getBlockIdForRow(template, row.sourceRow),
  }));

  return {
    vertical,
    horizontal: buildHorizontalCriteria(template),
  };
}

export async function buildCriterionCatalogByTemplate(templates: FormTemplate[]) {
  const entries = await Promise.all(
    templates.map(async (template) => [template.id, await buildTemplateCriterionCatalog(template)] as const),
  );

  return Object.fromEntries(entries) as Record<string, TemplateCriterionCatalog>;
}

export function resolveExtractFieldAxes(
  field: {
    firstAxis: 'VERTICAL' | 'HORIZONTAL';
    firstCriterionKey: string;
    secondAxis: 'VERTICAL' | 'HORIZONTAL';
    secondCriterionKey: string;
  },
  catalog: TemplateCriterionCatalog | undefined,
) {
  if (!catalog) {
    return {
      verticalCriterion: null,
      horizontalCriterion: null,
      isValid: false,
    };
  }

  const firstCollection = field.firstAxis === 'VERTICAL' ? catalog.vertical : catalog.horizontal;
  const secondCollection = field.secondAxis === 'VERTICAL' ? catalog.vertical : catalog.horizontal;

  const firstCriterion = firstCollection.find((item) => item.key === field.firstCriterionKey) || null;
  const secondCriterion = secondCollection.find((item) => item.key === field.secondCriterionKey) || null;

  const verticalCriterion =
    (field.firstAxis === 'VERTICAL' ? firstCriterion : secondCriterion) || null;
  const horizontalCriterion =
    (field.firstAxis === 'HORIZONTAL' ? firstCriterion : secondCriterion) || null;

  const isValid =
    Boolean(verticalCriterion && horizontalCriterion) &&
    field.firstAxis !== field.secondAxis &&
    typeof horizontalCriterion?.valueIndex === 'number' &&
    typeof verticalCriterion?.sourceRow === 'number';

  return {
    verticalCriterion,
    horizontalCriterion,
    isValid,
  };
}
