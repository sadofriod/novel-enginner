import { SimpleTreeView, TreeItem } from '@mui/x-tree-view';

import type { WorkspaceTree } from '../../api-types';

export interface WorkspaceSelection {
  readonly kind: string;
  readonly id: string;
}

export function selectionKey(selection: WorkspaceSelection): string {
  return `${selection.kind}::${selection.id}`;
}

export interface WorkspaceTreeViewProps {
  readonly tree: WorkspaceTree;
  readonly selected?: WorkspaceSelection | undefined;
  readonly onSelect: (selection: WorkspaceSelection) => void;
}

const GROUP_LABELS: Readonly<Record<string, string>> = {
  characters: '角色',
  factions: '阵营',
  locations: '地点',
  facts: '事实',
  'plot-clues': '伏笔',
  relationships: '关系',
  resources: '资源',
  'tech-rules': '科技规则',
};

function parseSelectionKey(key: string): WorkspaceSelection | undefined {
  const separator = key.indexOf('::');
  if (separator === -1) {
    return undefined;
  }
  return { kind: key.slice(0, separator), id: key.slice(separator + 2) };
}

function parentItemIds(tree: WorkspaceTree): readonly string[] {
  const groups: string[] = [
    ...tree.entityGroups.map((group) => `group::${group.group}`),
    ...(tree.planningAnchors.length > 0 ? ['group::planning-anchors'] : []),
    ...(tree.bookDocs.length > 0 ? ['group::book-docs'] : []),
    ...(tree.unclassified.length > 0 ? ['group::unclassified'] : []),
  ];
  return [
    ...tree.volumes.map((volume) => selectionKey({ kind: volume.kind, id: volume.id })),
    ...groups,
  ];
}

export function WorkspaceTreeView({ tree, selected, onSelect }: WorkspaceTreeViewProps) {
  const selectedKey = selected === undefined ? null : selectionKey(selected);

  const handleSelectionChange = (_event: React.SyntheticEvent | null, itemIds: string | null): void => {
    if (itemIds === null) {
      return;
    }
    const parsed = parseSelectionKey(itemIds);
    if (parsed !== undefined) {
      onSelect(parsed);
    }
  };

  return (
    <nav aria-label="书目录">
      <SimpleTreeView
        selectedItems={selectedKey}
        onSelectedItemsChange={handleSelectionChange}
        defaultExpandedItems={parentItemIds(tree)}
        sx={{ fontSize: 13 }}
      >
        {tree.volumes.map((volume) => (
          <TreeItem
            key={volume.id}
            itemId={selectionKey({ kind: volume.kind, id: volume.id })}
            label={volume.label}
          >
            {volume.chapters.map((chapter) => (
              <TreeItem
                key={chapter.id}
                itemId={selectionKey({ kind: chapter.kind, id: chapter.id })}
                label={`${chapter.chapterNumber === undefined ? '' : `第 ${chapter.chapterNumber} 章 · `}${chapter.label}`}
              >
                {chapter.scenes.map((scene) => (
                  <TreeItem key={scene.id} itemId={`scene::${scene.id}`} label={`· ${scene.id}`} disableSelection />
                ))}
              </TreeItem>
            ))}
          </TreeItem>
        ))}

        {tree.entityGroups.map((group) => (
          <TreeItem
            key={group.group}
            itemId={`group::${group.group}`}
            label={GROUP_LABELS[group.group] ?? group.group}
            disableSelection
          >
            {group.entities.map((node) => (
              <TreeItem key={node.id} itemId={selectionKey({ kind: node.kind, id: node.id })} label={node.label} />
            ))}
          </TreeItem>
        ))}

        {tree.planningAnchors.length > 0 && (
          <TreeItem itemId="group::planning-anchors" label="规划锚点" disableSelection>
            {tree.planningAnchors.map((node) => (
              <TreeItem key={node.id} itemId={selectionKey({ kind: node.kind, id: node.id })} label={node.label} />
            ))}
          </TreeItem>
        )}

        {tree.bookDocs.length > 0 && (
          <TreeItem itemId="group::book-docs" label="书设定" disableSelection>
            {tree.bookDocs.map((node) => (
              <TreeItem key={node.id} itemId={selectionKey({ kind: node.kind, id: node.id })} label={node.label} />
            ))}
          </TreeItem>
        )}

        {tree.unclassified.length > 0 && (
          <TreeItem itemId="group::unclassified" label="未分类" disableSelection>
            {tree.unclassified.map((node) => (
              <TreeItem key={node.id} itemId={selectionKey({ kind: node.kind, id: node.id })} label={node.label} />
            ))}
          </TreeItem>
        )}
      </SimpleTreeView>
    </nav>
  );
}
