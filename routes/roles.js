/**
 * Module for managing 'capacitaciones'
 * @module Roles
 */

const admin = require('firebase-admin');
const { reset } = require('nodemon');

const add = async (firestore, req, res) => {
  const { role_title } = req.body;

  if (role_title === undefined || role_title === '') {
    return res.send({
      error: true,
      message: 'role_title is invalid',
    });
  }

  const new_role_entry = {
    title: role_title.toLowerCase(),
    members: [],
  };

  // check that current role_title is not already registered
  const query = await firestore
    .collection('roles')
    .where('role_title', '==', new_role_entry.title)
    .get()
    .then((snapshot) => {
      if (!snapshot.empty) {
        return res.send({
          error: true,
          message: 'This title is already in use',
          data: snapshot,
        });
      }
    });

  try {
    const collectionref = await firestore.collection('roles');
    const docref = await collectionref.add(new_role_entry); // add new role to roles collection
    // --------- success ----------//
    // ----------VVVVVVV-----------//
    res.send({
      error: false,
      data: docref.id,
    });
  } catch (e) {
    return res.send({
      error: true,
      message: e,
    });
  }
};

const getAllRoles = async (firestore, req, res) => {
  let dataRes = {};
  try {
    const rolesRef = await firestore.collection('roles');
    const snapshot = await rolesRef.get();
    snapshot.forEach((doc) => {
      dataRes[doc.id] = doc.data();
    });
    res.send({
      error: false,
      data: dataRes,
    });
  } catch (e) {
    return res.send({
      error: true,
      message: e,
    });
  }
};

const getAllRoleUsers = async (firestore, req, res) => {
  const { id } = req.body; //gets role id from body
  let dataRes = [];
  try {
    const rolesRef = await firestore.collection('roles').doc(id);
    const role = await rolesRef.get();
    if (role.exists) {
      //checks for user id in users collection
      const userIds = role.data().members;
      const usersRef = firestore.collection('users');
      const snapshot = await usersRef.where('uid', 'in', userIds).get();
      if (!snapshot.empty) {
        snapshot.forEach((doc) => {
          dataRes.push(doc.data());
        });
      }
      return res.send({
        error: false,
        users: dataRes,
      });
    } else {
      return res.send({
        error: true,
        message: `No role with ID: ${id}`,
      });
    }
  } catch (e) {
    res.send({
      error: true,
      message: `Unexpected error: ${e}`,
    });
  }
};

const addRoleMember = async (firestore, req, res) => {
  const roleDocId = req.params.id;
  const { new_role_members } = req.body;

  const docRef = await firestore.collection('roles').doc(roleDocId);

  try {
    docRef.update({
      members: admin.firestore.FieldValue.arrayUnion(...new_role_members),
    });
    res.send({
      error: false,
    });
  } catch (e) {
    return res.send({
      error: true,
      message: e,
    });
  }
};

const remove = async (firestore, req, res) => {
  const { id } = req.params; //role ID

  if (id == null || id === '') {
    res.send({
      error: true,
      message: 'ID field required',
    });
  }

  try {
    const docRef = await firestore.collection('roles').doc(id).delete();
    res.send({
      error: false,
      message: 'Role deleted succesfuly',
    });
  } catch (e) {
    res.send({
      error: true,
      message: `Unexpected error: ${e}`,
    });
  }
};

const revoke = async (firestore, req, res) => {
  const { id } = req.params; //role ID
  const { users } = req.body; // user ID's

  if (id === '' || id == null) {
    res.send({
      error: true,
      message: 'ID field required',
    });
  }

  if (users === '' || users == null || users.length < 1) {
    res.send({
      error: true,
      message: 'USER_ID field required',
    });
  }

  const docRef = await firestore.collection('roles').doc(id);

  try {
    docRef.update({
      members: admin.firestore.FieldValue.arrayRemove(...users),
    });

    //Removes role from user document role array
    for (const user of users) {
      await firestore
        .collection('users')
        .doc(user)
        .update({
          roles: admin.firestore.FieldValue.arrayRemove(id),
        });
    }

    res.send({
      error: false,
      message: 'Role deleted succesfuly from users',
    });
  } catch (e) {
    res.send({
      error: true,
      message: `Unexpected error: ${e}`,
    });
  }
};

module.exports = {
  add,
  getAllRoles,
  getAllRoleUsers,
  addRoleMember,
  remove,
  revoke,
};
