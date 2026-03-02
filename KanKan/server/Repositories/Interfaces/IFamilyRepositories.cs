using KanKan.API.Models.Entities;

namespace KanKan.API.Repositories.Interfaces;

public interface IFamilyTreeRepository
{
    Task<List<FamilyTree>> GetByDomainAsync(string domain);
    Task<FamilyTree?> GetByIdAsync(string id);
    Task<FamilyTree> CreateAsync(FamilyTree tree);
    Task<FamilyTree> UpdateAsync(FamilyTree tree);
    Task DeleteAsync(string id);
}

public interface IFamilyPersonRepository
{
    Task<List<FamilyPerson>> GetByTreeIdAsync(string treeId);
    Task<FamilyPerson?> GetByIdAsync(string id);
    Task<FamilyPerson> CreateAsync(FamilyPerson person);
    Task<FamilyPerson> UpdateAsync(FamilyPerson person);
    Task DeleteAsync(string id);
    Task DeleteByTreeIdAsync(string treeId);
}

public interface IFamilyRelationshipRepository
{
    Task<List<FamilyRelationship>> GetByTreeIdAsync(string treeId);
    Task<FamilyRelationship?> GetByIdAsync(string id);
    Task<FamilyRelationship> CreateAsync(FamilyRelationship rel);
    Task<FamilyRelationship> UpdateAsync(FamilyRelationship rel);
    Task DeleteAsync(string id);
    Task DeleteByPersonIdAsync(string personId);
    Task DeleteByTreeIdAsync(string treeId);
    Task InsertManyAsync(List<FamilyRelationship> rels);
}
