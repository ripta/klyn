-- Rewrite relative links ending in .md (optionally with a #fragment) to .html,
-- so cross-references between converted pages keep working.
function Link(el)
  local target = el.target

  if target:match("^%a[%w.+-]*://") then
    return el
  end

  local rewritten, count = target:gsub("%.md$", ".html")
  if count == 0 then
    rewritten, count = target:gsub("%.md#", ".html#")
  end

  if count > 0 then
    el.target = rewritten
  end

  return el
end
