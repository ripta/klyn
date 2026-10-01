-- Promote the document's first level-1 heading into the `title` metadata
-- (rendered by template.html into <title> and <h1 class="page-title">),
-- and remove it from the body so it isn't shown twice.
function Pandoc(doc)
  if doc.meta.title == nil then
    for i, block in ipairs(doc.blocks) do
      if block.t == "Header" and block.level == 1 then
        doc.meta.title = pandoc.MetaString(pandoc.utils.stringify(block.content))
        table.remove(doc.blocks, i)
        break
      end
    end
  end
  return doc
end
