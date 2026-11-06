-- Inventory references are shared across loadouts, so a mark for another character must be rejected.
-- Validate the whole change before mutating references; a later refusal must not leave earlier writes planned.
-- Reference updates touch an item-set group, so mutations within one group are not independent writes.

local before = args['propertyForm']
local after = args['afterPropertyForm']
local character = after['propertyId']
local user_id = after['userId']

local function slot_values(form)
    local values = {}
    local slots = form and form['slots']
    if slots == nil then
        return values
    end
    for _, slot in ipairs(slots) do
        local property_id = slot['propertyId']
        if property_id ~= nil and property_id ~= '' then
            table.insert(values, property_id)
        end
    end
    return values
end

local function parse_item_set(property_id)
    local parts = {}
    for part in string.gmatch(property_id, '([^:]+)') do
        table.insert(parts, part)
    end
    if #parts ~= 14 or parts[1] ~= 'grn' or parts[5] ~= 'inventory' or parts[7] ~= 'user'
        or parts[9] ~= 'inventory' or parts[11] ~= 'item' or parts[13] ~= 'itemSet' then
        return nil
    end
    return {
        namespace_name = parts[6],
        user_id = parts[8],
        inventory_name = parts[10],
        item_name = parts[12],
        item_set_name = parts[14],
    }
end

-- Use item and set identity because full GRNs contain colons excluded from referenceOf.
local function mark_of(property_id)
    local item_set = parse_item_set(property_id)
    local mark = property_id
    if item_set ~= nil then
        mark = item_set.item_name .. '.' .. item_set.item_set_name
    end
    if string.len(mark) > 128 or string.find(mark, '^[-_.a-zA-Z0-9]+$') == nil then
        fail('BadRequest', 'loadout.character.unmarkable')
    end
    return mark
end

local character_mark = mark_of(character)

local before_values = slot_values(before)
local after_values = slot_values(after)

local worn_before = {}
for _, value in ipairs(before_values) do
    worn_before[value] = true
end

local worn_after = {}
for _, value in ipairs(after_values) do
    if worn_after[value] then
        fail('BadRequest', 'loadout.equipment.wornTwice')
    end
    worn_after[value] = true
end

local added = {}
for _, value in ipairs(after_values) do
    if not worn_before[value] then
        table.insert(added, value)
    end
end
local removed = {}
for _, value in ipairs(before_values) do
    if not worn_after[value] then
        table.insert(removed, value)
    end
end

local writes = {}
local groups = {}
local inventory = gs2('inventory')

local function plan_write(property_id, kind)
    local item_set = parse_item_set(property_id)
    if item_set == nil then
        return
    end
    local group = item_set.namespace_name .. ':' .. item_set.inventory_name .. ':' .. item_set.item_name
    if groups[group] then
        fail('BadRequest', 'loadout.equipment.sameItemTwice')
    end
    groups[group] = true
    table.insert(writes, { kind = kind, item_set = item_set })
end

for _, property_id in ipairs(removed) do
    plan_write(property_id, 'remove')
end

for _, property_id in ipairs(added) do
    local item_set = parse_item_set(property_id)
    if item_set ~= nil then
        local read = inventory.get_item_set_by_user_id({
            namespace_name = item_set.namespace_name,
            inventory_name = item_set.inventory_name,
            user_id = user_id,
            item_name = item_set.item_name,
            item_set_name = item_set.item_set_name,
        })
        if read['isError'] then
            fail(read['statusCode'], read['errorMessage'])
        end
        local mine = false
        for _, held in ipairs(read['result']['items'] or {}) do
            for _, reference in ipairs(held['referenceOf'] or {}) do
                if reference == character_mark then
                    mine = true
                else
                    fail('BadRequest', 'loadout.equipment.alreadyEquipped')
                end
            end
        end
        -- Reusing this character's existing mark makes retries idempotent.
        if not mine then
            plan_write(property_id, 'add')
        end
    end
end

for _, write in ipairs(writes) do
    local request = {
        namespace_name = write.item_set.namespace_name,
        inventory_name = write.item_set.inventory_name,
        user_id = user_id,
        item_name = write.item_set.item_name,
        item_set_name = write.item_set.item_set_name,
        reference_of = character_mark,
    }
    local response
    if write.kind == 'add' then
        response = inventory.add_reference_of_by_user_id(request)
    else
        response = inventory.delete_reference_of_by_user_id(request)
    end
    -- A missing reference already satisfies removal; retries must not fail just because it is gone.
    if response['isError'] and not (write.kind == 'remove' and response['statusCode'] == 404) then
        fail(response['statusCode'], response['errorMessage'])
    end
end

result = {
    permit = true,
}
