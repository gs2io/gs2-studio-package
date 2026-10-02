-- One piece of equipment is worn by one character at a time.
--
-- Runs before GS2-Formation saves a character's loadout. A piece put on is
-- marked with the character in its item set's referenceOf, and a piece taken
-- off has the mark removed. A piece already marked by another character is
-- refused: it has to be taken off that character first.
--
-- The marks are written through the inventory while this script runs, and
-- they are committed together when it ends, even when it then fails. So every
-- check is made before anything is written, and nothing is written for an
-- update that is refused.
--
-- Marking rewrites the whole item-set group of one item (every set the player
-- holds of it), and two writes to one group in a single run can overwrite each
-- other. An update that would touch one group twice, such as swapping one sword
-- for another of the same kind, is refused and has to be made as two presses.
--
-- A slot value that is not an inventory item set is passed through untouched.
--
-- The mark names the character by its item and item set, "<item>.<set>": a
-- referenceOf value is at most 128 characters of [-_.a-zA-Z0-9], which a GRN,
-- with its colons, is not.

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

-- grn:gs2:{region}:{owner}:inventory:{ns}:user:{user}:inventory:{inventory}:item:{item}:itemSet:{set}
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

-- The character's mark: its item and item set when it is an inventory item
-- set, or its property id as it is when that already fits a referenceOf.
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

-- Every write this run would make, checked before any is made.
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
        -- A mark this character already holds, left by an earlier run, is
        -- taken as it is rather than refused.
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
    -- A mark already gone is what taking off wanted.
    if response['isError'] and not (write.kind == 'remove' and response['statusCode'] == 404) then
        fail(response['statusCode'], response['errorMessage'])
    end
end

result = {
    permit = true,
}
